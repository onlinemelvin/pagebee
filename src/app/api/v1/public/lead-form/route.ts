import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { leadCaptureEnabled } from "@/lib/modules/lead";
import { defaultLeadFormHtml } from "@/lib/site/lead-form";
import { goalToLeadType, goalToCtaLabel, goalToFormBlurb, goalToMessagePrompt } from "@/lib/site/lead-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint — fetched by generated client sites (often a cross-origin tenant subdomain) to
// learn whether the lead-capture form is live right now. The form HTML is baked into the site at
// generation; this lets the owner turn it on/off from the dashboard with NO rebuild: when disabled
// the serve-time hydrator hides the form. Mirrors /public/gallery.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...(extra ?? {}) } });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/v1/public/lead-form
 * Auth: site token → tenant. Returns `{ enabled, html?, leadType?, ctaLabel? }`. `enabled` is true
 * only when the plan includes the form AND the owner hasn't turned it off; `html` is the site's
 * stored bespoke form (built at generation), falling back to a platform default for sites that
 * predate it. `leadType`/`ctaLabel` come from the owner's currently-chosen goal (Website.leadFormGoal)
 * so the serve-time hydrator can retype the form and relabel the page's CTA buttons LIVE when the
 * owner changes the goal on the Inquiries page — no rebuild. Both are null when no goal is set (the
 * site keeps whatever it was generated with). Works in preview too, so toggling reflects while
 * reviewing. No caching: a flip must show on the very next page load.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "lead-form", { limit: 120, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  try {
    const NO_CACHE = { "Cache-Control": "no-store" };
    // The form built for the version we're serving: the published version when live, else the
    // latest version (preview). Older sites have none stored → use the platform default so the
    // feature still works without a rebuild. leadFormGoal drives the CTA label + lead type.
    const web = await prisma.website.findFirst({
      where: { clientId: site.clientId },
      select: {
        leadFormGoal: true,
        publishedVersion: { select: { leadFormHtml: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { leadFormHtml: true } },
      },
    });
    const ctaLabel = goalToCtaLabel(web?.leadFormGoal);
    const leadType = goalToLeadType(web?.leadFormGoal);
    const formBlurb = goalToFormBlurb(web?.leadFormGoal);
    const messagePrompt = goalToMessagePrompt(web?.leadFormGoal);

    const enabled = await leadCaptureEnabled(site.clientId);
    // When disabled we still return ctaLabel so the hydrator knows the original intent; the runtime
    // swaps the CTA to a "call us" fallback regardless.
    if (!enabled) return json({ enabled: false, ctaLabel }, 200, NO_CACHE);

    const html = web?.publishedVersion?.leadFormHtml ?? web?.versions[0]?.leadFormHtml ?? defaultLeadFormHtml();
    return json({ enabled: true, html, leadType, ctaLabel, formBlurb, messagePrompt }, 200, NO_CACHE);
  } catch (err) {
    console.error("[GET /api/v1/public/lead-form]", err);
    return json({ error: "internal_error" }, 500);
  }
}
