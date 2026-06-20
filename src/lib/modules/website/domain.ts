import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { checkCustomDomain, planHosts, type DomainVerification } from "@/lib/site/domain";
import {
  vercelConfigured,
  addProjectDomain,
  verifyProjectDomain,
  removeProjectDomain,
  VercelError,
} from "@/lib/vercel/domains";

/**
 * Custom domains for Connect/Automate sites. A "connection" provisions a host PAIR — the apex and
 * its www (or a lone subdomain) — as rows in WebsiteDomain. NO admin review: connecting a domain
 * the owner already controls costs PageBee nothing, so it's provisioned immediately. Flow:
 *   1. Owner submits a domain  → requestCustomDomain → hosts added to Vercel, "verifying"
 *   2. Owner sets the DNS       → panel poll + cron pollDomainVerification → "active" as DNS resolves
 *
 * The plan/feature gate (assertFeature "customDomain") is enforced at the route; this layer assumes
 * the caller may manage domains. One connection per site at a time — remove the current one to change it.
 */

const ROOT_DOMAIN = () => process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

// Host rows that represent an in-flight or live connection (i.e. block a new request / show in the
// admin queue). A rejected/removed connection deletes its rows, so these are the only live states.
// Includes the purchase-path states (price_review = over the cap, awaiting admin; purchasing = buy
// in flight) so a bought-domain in progress also blocks a new request and shows in the admin queue.
export const LIVE_STATES = ["requested", "verifying", "active", "error", "price_review", "purchasing"];

/** Per-host detail for the owner's domain panel and the admin queue. */
export interface DomainHostState {
  host: string;
  kind: string; // apex | www | subdomain
  isPrimary: boolean;
  status: string; // requested | verifying | active | error | price_review | purchasing
  verification: DomainVerification | null;
  error: string | null;
  source: string; // "connect" | "purchase"
  priceCents: number | null; // purchase price (primary host of a bought domain)
}

/** The whole custom-domain connection for a site (its host pair), aggregated for the UI. */
export interface DomainState {
  domain: string | null; // the primary (canonical) host
  status: string | null; // aggregate: requested | verifying | active | error
  hosts: DomainHostState[];
  requestedAt: Date | null;
}

const hostSelect = {
  host: true,
  kind: true,
  isPrimary: true,
  status: true,
  verification: true,
  error: true,
  requestedAt: true,
  source: true,
  priceCents: true,
} satisfies Prisma.WebsiteDomainSelect;

type HostRow = Prisma.WebsiteDomainGetPayload<{ select: typeof hostSelect }>;

function toHostState(r: HostRow): DomainHostState {
  return {
    host: r.host,
    kind: r.kind,
    isPrimary: r.isPrimary,
    status: r.status,
    verification: (r.verification as unknown as DomainVerification | null) ?? null,
    error: r.error,
    source: r.source,
    priceCents: r.priceCents,
  };
}

/** Roll the host rows up into one connection status the UI can switch on. */
function aggregate(rows: HostRow[]): DomainState {
  if (!rows.length) return { domain: null, status: null, hosts: [], requestedAt: null };
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  const statuses = rows.map((r) => r.status);
  let status: string;
  if (statuses.some((s) => s === "error")) status = "error";
  else if (statuses.some((s) => s === "price_review")) status = "price_review"; // over cap → admin
  else if (statuses.some((s) => s === "purchasing")) status = "purchasing"; // buy in flight
  else if (statuses.some((s) => s === "requested")) status = "requested";
  else if (primary.status === "active") status = "active"; // canonical live → site reachable
  else status = "verifying";
  return {
    domain: primary.host,
    status,
    hosts: rows.map(toHostState),
    requestedAt: rows.reduce<Date | null>((min, r) => (!min || r.requestedAt < min ? r.requestedAt : min), null),
  };
}

async function siteIdForClient(clientId: string): Promise<string | null> {
  const site = await prisma.website.findFirst({ where: { clientId }, select: { id: true } });
  return site?.id ?? null;
}

/** The current custom-domain connection for a client's site (for the owner's domain panel). */
export async function getDomainState(clientId: string): Promise<DomainState | null> {
  const websiteId = await siteIdForClient(clientId);
  if (!websiteId) return null;
  const rows = await prisma.websiteDomain.findMany({
    where: { websiteId, status: { in: LIVE_STATES } },
    orderBy: { isPrimary: "desc" },
    select: hostSelect,
  });
  return aggregate(rows);
}

export type RequestResult =
  | { ok: true; state: DomainState }
  | { ok: false; reason: "no_site" | "empty" | "invalid" | "platform_domain" | "taken" | "in_progress" };

/**
 * Owner connects a domain they already own. NO admin review — connecting costs PageBee nothing, so
 * if the owner can point DNS at us, that's enough. We validate, expand into the apex+www pair, and
 * provision on Vercel immediately: each host is added to the project (the sibling redirecting to the
 * primary), the DNS records to set are stored, and the hosts go to "verifying". The owner sets DNS
 * and the panel + cron poll until "active". A host Vercel rejects is parked in "error" (the owner
 * can remove + retry). One connection per site (remove the current one to change it).
 */
export async function requestCustomDomain(clientId: string, rawDomain: string): Promise<RequestResult> {
  const websiteId = await siteIdForClient(clientId);
  if (!websiteId) return { ok: false, reason: "no_site" };

  const check = checkCustomDomain(rawDomain, ROOT_DOMAIN());
  if (!check.ok) return { ok: false, reason: check.reason };

  const existing = await prisma.websiteDomain.count({ where: { websiteId, status: { in: LIVE_STATES } } });
  if (existing > 0) return { ok: false, reason: "in_progress" };

  const planned = planHosts(check.domain);
  // Globally unique across tenants (also enforced by the @unique column — this gives a clean error).
  const clash = await prisma.websiteDomain.findFirst({
    where: { host: { in: planned.map((p) => p.host) }, websiteId: { not: websiteId } },
    select: { id: true },
  });
  if (clash) return { ok: false, reason: "taken" };

  try {
    await prisma.websiteDomain.createMany({
      data: planned.map((p) => ({
        websiteId,
        host: p.host,
        kind: p.kind,
        isPrimary: p.isPrimary,
        source: "connect",
        status: "verifying",
        verification: { records: p.records } as unknown as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") return { ok: false, reason: "taken" };
    throw err;
  }

  // Provision on Vercel right away (no approval gate). The sibling host redirects to the primary;
  // merge any TXT challenge into the stored records; a host Vercel rejects is parked in "error".
  const rows = await prisma.websiteDomain.findMany({
    where: { websiteId, status: "verifying" },
    orderBy: { isPrimary: "desc" },
    select: { id: true, host: true, isPrimary: true, verification: true },
  });
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  for (const row of rows) {
    const base = (row.verification as unknown as DomainVerification | null) ?? { records: [] };
    const verification: DomainVerification = { records: base.records ?? [] };
    if (vercelConfigured()) {
      try {
        const vd = await addProjectDomain(row.host, { redirect: row.isPrimary ? undefined : primary.host });
        if (vd.verification?.length) {
          verification.txt = vd.verification
            .filter((v) => v.type === "TXT")
            .map((v) => ({ domain: v.domain, type: v.type, value: v.value }));
        }
      } catch (err) {
        const message = err instanceof VercelError ? `${err.code}: ${err.message}` : String(err);
        await prisma.websiteDomain.update({ where: { id: row.id }, data: { status: "error", error: message.slice(0, 500) } });
        continue;
      }
    }
    await prisma.websiteDomain.update({
      where: { id: row.id },
      data: { status: "verifying", verification: verification as unknown as Prisma.InputJsonValue, error: null },
    });
  }

  await writeAudit({
    action: "domain.connected",
    entityType: "Website",
    entityId: websiteId,
    clientId,
    metadata: { domain: primary.host, hosts: rows.map((r) => r.host), vercel: vercelConfigured() } as Prisma.InputJsonValue,
  });
  await emit("domain.requested", { clientId, websiteId, domain: primary.host });

  // Return the resulting state (verifying, or error if Vercel rejected the primary) — the panel
  // renders DNS records / instructions or the error accordingly.
  const state = await getDomainState(clientId);
  return { ok: true, state: state! };
}

/** Detach a site's live hosts from Vercel (best-effort) and delete the rows. Shared by reject/remove. */
async function teardownHosts(websiteId: string): Promise<string[]> {
  const rows = await prisma.websiteDomain.findMany({
    where: { websiteId },
    select: { host: true, status: true },
  });
  if (vercelConfigured()) {
    await Promise.all(
      rows
        .filter((r) => r.status === "verifying" || r.status === "active")
        .map((r) => removeProjectDomain(r.host).catch((e) => console.error("[domain] vercel detach failed", r.host, e))),
    );
  }
  await prisma.websiteDomain.deleteMany({ where: { websiteId } });
  return rows.map((r) => r.host);
}

/** Owner removes their custom domain (any state): detach all hosts from Vercel and clear the rows. */
export async function removeCustomDomain(clientId: string): Promise<{ ok: boolean }> {
  const websiteId = await siteIdForClient(clientId);
  if (!websiteId) return { ok: false };
  const hosts = await teardownHosts(websiteId);
  if (!hosts.length) return { ok: false };
  await writeAudit({
    action: "domain.removed",
    entityType: "Website",
    entityId: websiteId,
    clientId,
    metadata: { hosts } as Prisma.InputJsonValue,
  });
  return { ok: true };
}

const verifyRowSelect = {
  id: true,
  host: true,
  isPrimary: true,
  websiteId: true,
  website: { select: { clientId: true } },
} satisfies Prisma.WebsiteDomainSelect;

type VerifyRow = Prisma.WebsiteDomainGetPayload<{ select: typeof verifyRowSelect }>;

/** Ask Vercel to verify each "verifying" host; flip the confirmed ones to "active". Returns how
 *  many activated. Shared by the cron sweep and the owner's on-demand check. */
async function verifyRows(rows: VerifyRow[]): Promise<number> {
  let activated = 0;
  for (const row of rows) {
    try {
      const vd = await verifyProjectDomain(row.host);
      if (!vd.verified) continue;
      await prisma.websiteDomain.update({ where: { id: row.id }, data: { status: "active", error: null } });
      activated++;
      if (row.isPrimary) {
        await writeAudit({
          action: "domain.active",
          entityType: "Website",
          entityId: row.websiteId,
          clientId: row.website.clientId,
          metadata: { domain: row.host } as Prisma.InputJsonValue,
        });
        await emit("domain.active", { clientId: row.website.clientId, websiteId: row.websiteId, domain: row.host });
      }
    } catch (err) {
      // Transient API error — leave it "verifying" and retry next check; don't fail the batch.
      console.error("[domain] verify error for", row.host, err);
    }
  }
  return activated;
}

/**
 * Cron sweep (daily BACKSTOP on Hobby; the owner's on-demand check is the primary path): verify
 * every host awaiting DNS and flip the confirmed ones to "active". Idempotent and cheap; requires
 * Vercel to be wired — without it there's nothing to poll (verification is manual in that mode).
 */
export async function pollDomainVerification(limit = 200): Promise<{ checked: number; activated: number }> {
  if (!vercelConfigured()) return { checked: 0, activated: 0 };
  const pending = await prisma.websiteDomain.findMany({
    where: { status: "verifying" },
    orderBy: { requestedAt: "asc" },
    take: limit,
    select: verifyRowSelect,
  });
  const activated = await verifyRows(pending);
  return { checked: pending.length, activated };
}

/**
 * On-demand verification for a single client's hosts — runs when the owner clicks "Check status"
 * (or the open panel auto-polls). This is what makes a freshly-set DNS record go live in seconds
 * instead of waiting for the daily cron. Returns the refreshed connection state.
 */
export async function verifyClientDomains(clientId: string): Promise<DomainState | null> {
  const websiteId = await siteIdForClient(clientId);
  if (!websiteId) return null;
  if (vercelConfigured()) {
    const rows = await prisma.websiteDomain.findMany({
      where: { websiteId, status: "verifying" },
      select: verifyRowSelect,
    });
    await verifyRows(rows);
  }
  return getDomainState(clientId);
}
