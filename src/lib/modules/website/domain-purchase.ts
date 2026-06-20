import { Prisma } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { CHEAP_MODEL } from "@/lib/ai/models";
import { checkCustomDomain, planHosts } from "@/lib/site/domain";
import { getRegistrarGuide } from "@/lib/site/registrar-instructions";
import { registrarConfigured, lookup as registrarLookup, getPrice, buyDomain, RegistrarError } from "@/lib/vercel/registrar";
import { vercelConfigured, addProjectDomain } from "@/lib/vercel/domains";
import { LIVE_STATES, getDomainState, type DomainState } from "./domain";

/**
 * "Buy a brand new domain" path. The client picks/enters a domain (with AI suggestions); we check
 * availability + price via the Vercel registrar; PageBee absorbs the cost, so a quote at/under the
 * cap is auto-bought, while an over-cap quote parks as `price_review` for an admin. On buy we attach
 * the apex + www to the project (Vercel manages DNS for domains it registers) → verifying → active.
 */

const ROOT_DOMAIN = () => process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const PRICE_CAP_CENTS = () => Number(process.env.DOMAIN_PRICE_CAP_CENTS ?? 2000);

async function siteIdFor(clientId: string): Promise<string | null> {
  const s = await prisma.website.findFirst({ where: { clientId }, select: { id: true } });
  return s?.id ?? null;
}

// Per-client test "dry-run" flag (a FeatureFlag row). Only a gated tester can SET it (the toggle
// route checks isDomainDryRunEligible), so reading it here is safe — a real customer can never
// have it on. Used by executePurchase and surfaced to the page for the toggle's current state.
const DRY_RUN_KEY = "domainBuyDryRun";

export async function isDomainBuyDryRun(clientId: string): Promise<boolean> {
  const f = await prisma.featureFlag
    .findUnique({ where: { clientId_key: { clientId, key: DRY_RUN_KEY } }, select: { enabled: true } })
    .catch(() => null);
  return f?.enabled === true;
}
const dryRunEnabledFor = isDomainBuyDryRun;

// ── Availability + price lookup ───────────────────────────────────────────────
export interface DomainLookup {
  domain: string;
  available: boolean;
  priceCents: number | null;
  affordable: boolean; // priceCents <= cap → auto-buys without admin review
}

export type LookupResult =
  | { ok: true; result: DomainLookup }
  | { ok: false; reason: "empty" | "invalid" | "platform_domain" | "registrar_unavailable" | "lookup_failed" };

/** Check one domain's availability + registration price. */
export async function lookupDomain(rawDomain: string): Promise<LookupResult> {
  const check = checkCustomDomain(rawDomain, ROOT_DOMAIN());
  if (!check.ok) return { ok: false, reason: check.reason };
  if (!registrarConfigured()) return { ok: false, reason: "registrar_unavailable" };
  try {
    const { available, price } = await registrarLookup(check.domain);
    const priceCents = price?.priceCents ?? null;
    return {
      ok: true,
      result: { domain: check.domain, available, priceCents, affordable: priceCents != null && priceCents <= PRICE_CAP_CENTS() },
    };
  } catch (err) {
    console.error("[domain-purchase] lookup failed", check.domain, err);
    return { ok: false, reason: "lookup_failed" };
  }
}

// ── AI name suggestions ───────────────────────────────────────────────────────
export interface DomainSuggestion {
  domain: string;
  priceCents: number | null;
  affordable: boolean;
}

/** AI-generate domain ideas from the business + preferred TLDs, then keep the available ones (with price). */
export async function suggestDomainNames(
  clientId: string,
  opts: { tlds?: string[]; keyword?: string } = {},
): Promise<DomainSuggestion[]> {
  if (!registrarConfigured()) return [];
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true, businessType: true },
  });
  if (!client) return [];
  const tlds = (opts.tlds?.length ? opts.tlds : ["com", "biz", "us"]).map((t) => t.replace(/^\./, "").toLowerCase());

  const ideas = await aiDomainIdeas(client.businessName, client.businessType, tlds, opts.keyword);
  const out: DomainSuggestion[] = [];
  for (const domain of ideas.slice(0, 12)) {
    try {
      const { available, price } = await registrarLookup(domain);
      if (!available) continue;
      const priceCents = price?.priceCents ?? null;
      // Only surface names within the auto-buy cap — the end user never sees price or "needs review".
      if (priceCents == null || priceCents > PRICE_CAP_CENTS()) continue;
      out.push({ domain, priceCents, affordable: true });
    } catch {
      /* skip a failed lookup */
    }
    if (out.length >= 6) break;
  }
  return out;
}

async function aiDomainIdeas(
  businessName: string,
  businessType: string | null,
  tlds: string[],
  keyword?: string,
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: CHEAP_MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system: [
        "You suggest available-sounding domain names for a small local business.",
        "Return ONLY a JSON array of 12 lowercase domain strings (name + TLD, no protocol, no www).",
        `Use ONLY these TLDs: ${tlds.join(", ")}. Keep names short, brandable, easy to spell; mix the business name,`,
        "a relevant keyword, and the locality. No hyphens unless necessary, no numbers. Example: [\"acmeplumbing.com\", ...]",
      ].join(" "),
      messages: [
        { role: "user", content: JSON.stringify({ businessName, businessType, keyword: keyword ?? null }) },
      ],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    const json = (text.match(/\[[\s\S]*\]/)?.[0] ?? "[]").trim();
    const arr = JSON.parse(json) as unknown[];
    const allowed = new Set(tlds);
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, ""))
      .filter((s) => /^[a-z0-9-]+\.[a-z]{2,}$/.test(s) && allowed.has(s.split(".").pop()!));
  } catch (err) {
    console.error("[domain-purchase] AI ideas failed", err);
    return [];
  }
}

// ── Purchase flow ─────────────────────────────────────────────────────────────
/**
 * Owner asks to buy a specific domain. Validates + re-checks availability/price, then buys it
 * immediately — NO admin review. Only names within the cap are buyable (the UI never offers
 * over-cap names); an over-cap domain is rejected here as a backstop. One domain per site at a
 * time (must remove an existing connection/purchase first).
 */
export async function requestPurchaseDomain(
  clientId: string,
  rawDomain: string,
): Promise<{ ok: true; state: DomainState } | { ok: false; reason: string }> {
  const websiteId = await siteIdFor(clientId);
  if (!websiteId) return { ok: false, reason: "no_site" };

  const existing = await prisma.websiteDomain.count({ where: { websiteId, status: { in: LIVE_STATES } } });
  if (existing > 0) return { ok: false, reason: "in_progress" };

  const look = await lookupDomain(rawDomain);
  if (!look.ok) return { ok: false, reason: look.reason };
  if (!look.result.available) return { ok: false, reason: "unavailable" };
  if (look.result.priceCents == null) return { ok: false, reason: "price_unavailable" };
  // Backstop: over the cap is not buyable (we never charge over the cap without review, and there
  // is no review). The UI already filters these out, so the owner should never hit this.
  if (!look.result.affordable) return { ok: false, reason: "unavailable" };

  const { domain, priceCents } = look.result;
  const planned = planHosts(domain);

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
        source: "purchase",
        priceCents: p.isPrimary ? priceCents : null,
        status: "purchasing",
      })),
    });
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") return { ok: false, reason: "taken" };
    throw err;
  }

  await writeAudit({
    action: "domain.purchase_requested",
    entityType: "Website",
    entityId: websiteId,
    clientId,
    metadata: { domain, priceCents } as Prisma.InputJsonValue,
  });
  await emit("domain.requested", { clientId, websiteId, domain });

  await executePurchase(websiteId, null); // buy now — no admin gate

  const state = await getDomainState(clientId);
  return { ok: true, state: state! };
}

/**
 * Register the domain via the Vercel registrar (re-quoting to guard the price), then attach the
 * apex + www to the project. Called inline from requestPurchaseDomain (no admin gate). Parks the
 * rows in `error` on any failure.
 */
export async function executePurchase(websiteId: string, reviewerId: string | null): Promise<{ ok: boolean; error?: string }> {
  const site = await prisma.website.findUnique({ where: { id: websiteId }, select: { clientId: true } });
  const rows = await prisma.websiteDomain.findMany({
    where: { websiteId, source: "purchase", status: "purchasing" },
    orderBy: { isPrimary: "desc" },
    select: { id: true, host: true, isPrimary: true },
  });
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  if (!site || !primary) return { ok: false, error: "nothing_to_buy" };
  const clientId = site.clientId;

  // TEST MODE (gated, see isDomainDryRunEligible): simulate a successful registration with NO
  // registrar call, NO charge, NO real domain. Flips the hosts straight to "active" so the panel
  // shows the full flow. The domain won't actually resolve — it's a UX/flow test only.
  if (await dryRunEnabledFor(clientId)) {
    await prisma.websiteDomain.updateMany({
      where: { websiteId, source: "purchase" },
      data: { status: "active", error: null },
    });
    await writeAudit({
      action: "domain.purchased",
      entityType: "Website",
      entityId: websiteId,
      clientId,
      actorId: reviewerId,
      metadata: { domain: primary.host, dryRun: true } as Prisma.InputJsonValue,
    });
    return { ok: true };
  }

  await prisma.websiteDomain.updateMany({ where: { websiteId, source: "purchase" }, data: { status: "purchasing", error: null } });

  try {
    if (!registrarConfigured()) throw new RegistrarError(503, "registrar_unavailable", "Domain registrar is not configured");
    // Re-quote and buy with that exact price (Vercel rejects expected_price_mismatch if it moved).
    const price = await getPrice(primary.host);
    await buyDomain(primary.host, { expectedPriceCents: price.priceCents });

    // Attach the registered domain (apex + www redirect) to the project. Vercel manages DNS for
    // domains it registers, so this resolves on its own → verifying → active via the cron sweep.
    if (vercelConfigured()) {
      for (const r of rows) {
        await addProjectDomain(r.host, { redirect: r.isPrimary ? undefined : primary.host }).catch((e) =>
          console.error("[domain-purchase] attach failed", r.host, e),
        );
      }
    }

    await prisma.websiteDomain.updateMany({ where: { websiteId, source: "purchase" }, data: { status: "verifying", error: null } });
    await prisma.websiteDomain.update({ where: { id: primary.id }, data: { priceCents: price.priceCents } });

    await writeAudit({
      action: "domain.purchased",
      entityType: "Website",
      entityId: websiteId,
      clientId,
      actorId: reviewerId,
      metadata: { domain: primary.host, priceCents: price.priceCents } as Prisma.InputJsonValue,
    });
    await emit("domain.approved", { clientId, websiteId, domain: primary.host });
    return { ok: true };
  } catch (err) {
    const message = err instanceof RegistrarError ? `${err.code}: ${err.message}` : String(err);
    await prisma.websiteDomain.updateMany({ where: { websiteId, source: "purchase" }, data: { status: "error", error: message.slice(0, 500) } });
    await writeAudit({
      action: "domain.purchase_failed",
      entityType: "Website",
      entityId: websiteId,
      clientId,
      actorId: reviewerId,
      metadata: { domain: primary.host, error: message.slice(0, 500) } as Prisma.InputJsonValue,
    }).catch(() => {});
    console.error("[domain-purchase] buy failed", primary.host, err);
    return { ok: false, error: message };
  }
}

// ── Connect-path DNS instructions ─────────────────────────────────────────────
export interface ConnectInstructions {
  registrar: string;
  steps: string[];
  dnsUrl?: string;
  ai: boolean; // steps were AI-written (unknown registrar)
}

/** Step-by-step DNS instructions for the client's registrar — hand-written when known, else AI. */
export async function getConnectInstructions(
  registrarKey: string,
  domain: string,
  records: { type: string; name: string; value: string }[],
): Promise<ConnectInstructions> {
  const guide = getRegistrarGuide(registrarKey);
  if (guide) return { registrar: guide.name, steps: guide.steps, dnsUrl: guide.dnsUrl, ai: false };
  const steps = await aiConnectInstructions(registrarKey, domain, records);
  return { registrar: registrarKey || "your registrar", steps, ai: true };
}

async function aiConnectInstructions(
  registrar: string,
  domain: string,
  records: { type: string; name: string; value: string }[],
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const generic = [
    `Sign in to ${registrar || "your domain registrar"} and open the DNS settings for ${domain}.`,
    "Find the DNS records / zone editor.",
    "Add each record in the table: choose the type (A or CNAME), enter the name/host and value exactly as shown, and save.",
    "Remove any existing parking or forwarding record on the same name first.",
    "Changes can take a few minutes to a few hours to take effect.",
  ];
  if (!apiKey) return generic;
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: CHEAP_MODEL,
      max_tokens: 500,
      thinking: { type: "disabled" },
      system: [
        "Write short, numbered, non-technical steps for a small-business owner to add DNS records at their domain registrar.",
        "Return ONLY a JSON array of 4-6 concise step strings. Don't restate the record values (shown separately) — explain WHERE to click.",
        "Mention removing any conflicting parking/redirect record, and that changes take time to propagate.",
      ].join(" "),
      messages: [{ role: "user", content: JSON.stringify({ registrar, domain, recordTypes: records.map((r) => r.type) }) }],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as unknown[];
    const steps = arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return steps.length ? steps : generic;
  } catch (err) {
    console.error("[domain-purchase] AI connect instructions failed", err);
    return generic;
  }
}
