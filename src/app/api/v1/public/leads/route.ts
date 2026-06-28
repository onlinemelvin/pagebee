import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited, rateLimitedKey } from "@/lib/ratelimit";
import { createLead, leadCaptureEnabled, leadInputSchema, looksLikeBotSubmission } from "@/lib/modules/lead";
import "@/lib/events/subscribers"; // register lead.created handlers
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs"; // Prisma requires the Node runtime
export const dynamic = "force-dynamic";

// Public endpoint — called cross-origin by generated client sites (incl. sandboxed
// null-origin iframes), so it advertises CORS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/v1/public/leads
 * Auth: site token (Bearer or x-site-token) → resolves the tenant.
 * Body: { type?, name, email, phone?, message?, source? }
 */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "leads", { limit: 8, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) {
    return json({ error: "unauthorized" }, 401);
  }

  // Per-tenant flood cap (on top of the per-IP limit above): a single site shouldn't receive a
  // torrent of leads, and distributed bots rotating source IPs still funnel into one token. Generous
  // enough for any real small business (30/hour), tight enough to blunt an automated spray.
  const flood = await rateLimitedKey(`leads:token:${site.clientId}`, { limit: 30, windowMs: 60 * 60_000 }, CORS);
  if (flood) return flood;

  const body = await req.json().catch(() => null);

  // Bot traps (a filled honeypot field, or a submit faster than any human could type). Respond like a
  // normal success so the bot gets no signal to adapt — but never store or deliver the lead.
  if (looksLikeBotSubmission(body)) {
    return json({ id: "ok", status: "RECEIVED" }, 200);
  }

  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "validation_error", issues: parsed.error.flatten() }, 400);
  }

  // Preview mode (before launch): accept but don't deliver — demo only.
  if (site.status === "preview") {
    return json({ id: "demo", status: "DEMO", demo: true }, 200);
  }

  // Lead capture must be live (on-plan AND not turned off by the owner). The site hides the form
  // when disabled, but enforce server-side so a stale/cached page can't deliver leads anyway.
  if (!(await leadCaptureEnabled(site.clientId))) {
    return json({ error: "forms_disabled" }, 403);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const lead = await createLead({ clientId: site.clientId, input: parsed.data, ip });
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: `client:${site.clientId}`,
      event: "lead_submitted",
      properties: {
        clientId: site.clientId,
        leadType: parsed.data.type,
        source: parsed.data.source,
      },
    });
    return json({ id: lead.id, status: lead.status, createdAt: lead.createdAt }, 201);
  } catch (err) {
    console.error("[POST /api/v1/public/leads]", err);
    return json({ error: "internal_error" }, 500);
  }
}
