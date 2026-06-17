import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { listWebsiteServices, serviceDurationLabel, getServiceDisplay } from "@/lib/modules/service";
import { serviceIconSvg } from "@/lib/site/service-icon-svg";

export const runtime = "nodejs"; // Prisma + react-dom/server (icon SVG) need the Node runtime
export const dynamic = "force-dynamic";

// Public endpoint — fetched by generated client sites (often a cross-origin tenant subdomain),
// so it advertises CORS. Read-only: it lists the live catalog the platform hydrates into the
// site's services section on every page load.
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
 * GET /api/v1/public/services
 * Auth: site token → tenant. Returns ONLY the services marked "show on website" (active,
 * non-default), each with a render-ready icon SVG and formatted duration/price. Works in
 * preview too, so the live catalog shows while reviewing.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "services", { limit: 120, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  try {
    const [rows, display] = await Promise.all([
      listWebsiteServices(site.clientId),
      getServiceDisplay(site.clientId),
    ]);
    const services = rows.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      icon: s.icon ?? "sparkles",
      iconSvg: serviceIconSvg(s.icon),
      durationLabel: serviceDurationLabel(s.durationMinutes),
      priceLabel: s.price != null ? `$${(s.price / 100).toFixed(2)}` : null,
    }));
    // showPrice/showDuration are the owner's explicit Services-tab toggles (the live site shows each
    // field only when its toggle is on). Briefly edge-cacheable so high-traffic sites don't hit the
    // DB every page load, while catalog/toggle changes still surface within seconds.
    return json({ services, showPrice: display.showPrice, showDuration: display.showDuration }, 200, {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
    });
  } catch (err) {
    console.error("[GET /api/v1/public/services]", err);
    return json({ error: "internal_error" }, 500);
  }
}
