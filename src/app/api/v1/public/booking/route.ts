import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { bookingEnabled } from "@/lib/modules/booking";
import { defaultBookingHtml } from "@/lib/site/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint — fetched by generated client sites to learn whether the booking widget is live and
// to get the stored trigger section. Lets the owner turn booking on/off from the dashboard with NO
// rebuild: the serve-time runtime injects/removes the trigger accordingly. Mirrors /public/lead-form.
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
 * GET /api/v1/public/booking
 * Auth: site token → tenant. Returns `{ enabled, html? }`. `enabled` is true only when the plan
 * includes booking AND the owner hasn't turned it off; `html` is the site's stored bespoke trigger
 * section (built at generation), or null for sites with none. No caching: a flip must show on the
 * very next page load.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "booking-status", { limit: 120, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  try {
    const NO_CACHE = { "Cache-Control": "no-store" };
    const enabled = await bookingEnabled(site.clientId);
    if (!enabled) return json({ enabled: false }, 200, NO_CACHE);

    const web = await prisma.website.findFirst({
      where: { clientId: site.clientId },
      select: {
        publishedVersion: { select: { bookingHtml: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { bookingHtml: true } },
      },
    });
    // Fall back to the platform default so existing booking-enabled sites (generated before booking
    // sections existed) show the widget without a rebuild — same as the lead-form feed.
    const html = web?.publishedVersion?.bookingHtml ?? web?.versions[0]?.bookingHtml ?? defaultBookingHtml();
    return json({ enabled: true, html }, 200, NO_CACHE);
  } catch (err) {
    console.error("[GET /api/v1/public/booking]", err);
    return json({ error: "internal_error" }, 500);
  }
}
