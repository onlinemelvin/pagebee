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
 * its www (or a lone subdomain) — as rows in WebsiteDomain. Flow (see ARCHITECTURE §11):
 *   1. Owner submits a domain  → requestCustomDomain   → host rows "requested" (NOT on Vercel yet)
 *   2. Admin approves          → approveDomainRequest  → each host added to Vercel, "verifying"
 *   3. Owner sets the DNS      → cron pollDomainVerification → "active" per host as DNS resolves
 *
 * Approving BEFORE the Vercel add is deliberate: an unvetted / typo'd / abusive domain never
 * touches the project. The plan/feature gate (assertFeature "customDomain") is enforced at the
 * route; this layer assumes the caller is allowed to manage domains. One connection per site at a
 * time — to change it, remove the current one first.
 */

const ROOT_DOMAIN = () => process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

// Host rows that represent an in-flight or live connection (i.e. block a new request / show in the
// admin queue). A rejected/removed connection deletes its rows, so these are the only live states.
const LIVE_STATES = ["requested", "verifying", "active", "error"];

/** Per-host detail for the owner's domain panel and the admin queue. */
export interface DomainHostState {
  host: string;
  kind: string; // apex | www | subdomain
  isPrimary: boolean;
  status: string; // requested | verifying | active | error
  verification: DomainVerification | null;
  error: string | null;
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
  };
}

/** Roll the host rows up into one connection status the UI can switch on. */
function aggregate(rows: HostRow[]): DomainState {
  if (!rows.length) return { domain: null, status: null, hosts: [], requestedAt: null };
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  const statuses = rows.map((r) => r.status);
  let status: string;
  if (statuses.some((s) => s === "error")) status = "error";
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
 * Owner submits a domain to connect. Validates + normalizes, expands it into a host pair (apex +
 * www), ensures none of those hosts are claimed by another tenant, and parks them as "requested"
 * for admin review. A site with an existing connection must remove it first (one at a time).
 */
export async function requestCustomDomain(clientId: string, rawDomain: string): Promise<RequestResult> {
  const websiteId = await siteIdForClient(clientId);
  if (!websiteId) return { ok: false, reason: "no_site" };

  const check = checkCustomDomain(rawDomain, ROOT_DOMAIN());
  if (!check.ok) return { ok: false, reason: check.reason };

  // One connection per site — block a new request while any host rows are still live.
  const existing = await prisma.websiteDomain.count({ where: { websiteId, status: { in: LIVE_STATES } } });
  if (existing > 0) return { ok: false, reason: "in_progress" };

  const planned = planHosts(check.domain);
  const hosts = planned.map((p) => p.host);

  // Globally unique across tenants (also enforced by the @unique column — this gives a clean error).
  const clash = await prisma.websiteDomain.findFirst({
    where: { host: { in: hosts }, websiteId: { not: websiteId } },
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
        status: "requested",
        // Records are deterministic from the host — store them now so approval only has to add the
        // (optional) Vercel TXT challenge. Not shown to the owner until the connection is approved.
        verification: { records: p.records } as unknown as Prisma.InputJsonValue,
      })),
    });
    await writeAudit({
      action: "domain.requested",
      entityType: "Website",
      entityId: websiteId,
      clientId,
      metadata: { domain: check.domain, hosts } as Prisma.InputJsonValue,
    });
    await emit("domain.requested", { clientId, websiteId, domain: check.domain, hosts });
    const state = await getDomainState(clientId);
    return { ok: true, state: state! };
  } catch (err) {
    // Unique-constraint race (two tenants submit the same host at once) → report as taken.
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
}

/** Pending + in-flight custom-domain connections for the admin queue (oldest request first). */
export async function listDomainRequests() {
  const sites = await prisma.website.findMany({
    where: { domains: { some: { status: { in: ["requested", "verifying", "error"] } } } },
    select: {
      id: true,
      client: { select: { businessName: true, subscription: { select: { plan: { select: { name: true } } } } } },
      domains: { where: { status: { in: LIVE_STATES } }, orderBy: { isPrimary: "desc" }, select: hostSelect },
    },
  });
  return sites
    .map((s) => ({
      websiteId: s.id,
      businessName: s.client.businessName,
      planName: s.client.subscription?.plan.name ?? null,
      ...aggregate(s.domains),
    }))
    .sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));
}

export type ApproveResult =
  | { ok: true; state: DomainState }
  | { ok: false; reason: "not_found" | "not_requested" | "vercel_rejected"; message?: string };

/**
 * Admin approves a requested connection: add every host to the Vercel project (the non-canonical
 * host as a 308 redirect to the primary), store the DNS records the owner must set, and flip each
 * host to "verifying". When Vercel isn't configured it still records the computed records so the
 * flow is testable (verification then has to be confirmed manually). A Vercel rejection parks that
 * host in "error"; the result is failure only if the PRIMARY host couldn't be added.
 */
export async function approveDomainRequest(
  websiteId: string,
  reviewerId: string | null,
): Promise<ApproveResult> {
  const site = await prisma.website.findUnique({
    where: { id: websiteId },
    select: { id: true, clientId: true },
  });
  if (!site) return { ok: false, reason: "not_found" };

  const rows = await prisma.websiteDomain.findMany({
    where: { websiteId, status: { in: ["requested", "error"] } },
    orderBy: { isPrimary: "desc" },
    select: { id: true, host: true, isPrimary: true, verification: true },
  });
  if (!rows.length) return { ok: false, reason: "not_requested" };

  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  let primaryOk = true;
  let firstError: string | undefined;

  for (const row of rows) {
    const base = (row.verification as unknown as DomainVerification | null) ?? { records: [] };
    const verification: DomainVerification = { records: base.records ?? [] };

    if (vercelConfigured()) {
      try {
        const vd = await addProjectDomain(row.host, {
          redirect: row.isPrimary ? undefined : primary.host,
        });
        if (vd.verification?.length) {
          verification.txt = vd.verification
            .filter((v) => v.type === "TXT")
            .map((v) => ({ domain: v.domain, type: v.type, value: v.value }));
        }
      } catch (err) {
        const message = err instanceof VercelError ? `${err.code}: ${err.message}` : String(err);
        firstError ??= message;
        if (row.isPrimary) primaryOk = false;
        await prisma.websiteDomain.update({
          where: { id: row.id },
          data: { status: "error", error: message.slice(0, 500) },
        });
        continue;
      }
    }

    await prisma.websiteDomain.update({
      where: { id: row.id },
      data: {
        status: "verifying",
        verification: verification as unknown as Prisma.InputJsonValue,
        error: null,
      },
    });
  }

  if (!primaryOk) {
    await writeAudit({
      action: "domain.approve_failed",
      entityType: "Website",
      entityId: websiteId,
      clientId: site.clientId,
      actorId: reviewerId,
      metadata: { host: primary.host, error: firstError ?? null } as Prisma.InputJsonValue,
    });
    return { ok: false, reason: "vercel_rejected", message: firstError };
  }

  await writeAudit({
    action: "domain.approved",
    entityType: "Website",
    entityId: websiteId,
    clientId: site.clientId,
    actorId: reviewerId,
    metadata: { domain: primary.host, hosts: rows.map((r) => r.host), vercel: vercelConfigured() } as Prisma.InputJsonValue,
  });
  await emit("domain.approved", { clientId: site.clientId, websiteId, domain: primary.host });
  const state = await getDomainState(site.clientId);
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

/** Admin declines a connection: detach + clear it so the owner can submit a different domain. */
export async function rejectDomainRequest(
  websiteId: string,
  reviewerId: string | null,
  reason?: string,
): Promise<{ ok: boolean }> {
  const site = await prisma.website.findUnique({ where: { id: websiteId }, select: { clientId: true } });
  if (!site) return { ok: false };
  const hosts = await teardownHosts(websiteId);
  if (!hosts.length) return { ok: false };
  await writeAudit({
    action: "domain.rejected",
    entityType: "Website",
    entityId: websiteId,
    clientId: site.clientId,
    actorId: reviewerId,
    metadata: { hosts, reason: reason ?? null } as Prisma.InputJsonValue,
  });
  return { ok: true };
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

/**
 * Cron sweep: for every host awaiting DNS ("verifying"), ask Vercel to verify and flip it to
 * "active" once confirmed. When a site's PRIMARY host goes active we emit domain.active (the site
 * is now reachable on its canonical host). Idempotent and cheap; requires Vercel to be wired —
 * without it there's nothing to poll (verification is manual in that mode).
 */
export async function pollDomainVerification(limit = 100): Promise<{ checked: number; activated: number }> {
  if (!vercelConfigured()) return { checked: 0, activated: 0 };
  const pending = await prisma.websiteDomain.findMany({
    where: { status: "verifying" },
    orderBy: { requestedAt: "asc" },
    take: limit,
    select: { id: true, host: true, isPrimary: true, websiteId: true, website: { select: { clientId: true } } },
  });

  let activated = 0;
  for (const row of pending) {
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
      // Transient API error — leave it "verifying" and retry next sweep; don't fail the batch.
      console.error("[domain] verify sweep error for", row.host, err);
    }
  }
  return { checked: pending.length, activated };
}

/** Resolve a published site by an ACTIVE custom-domain host (for the public renderer). */
export async function websiteIdByActiveHost(host: string): Promise<string | null> {
  const row = await prisma.websiteDomain.findFirst({
    where: { host, status: "active" },
    select: { websiteId: true },
  });
  return row?.websiteId ?? null;
}
