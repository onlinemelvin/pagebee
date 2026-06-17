import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { listMedia } from "@/lib/modules/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint — fetched by generated client sites (often a cross-origin tenant subdomain) to
// hydrate the photo gallery live from the owner's Media library. Returns images ONLY when the
// gallery feature is enabled; disabling the feature (or having no images) returns an empty list, so
// the serve-time hydrator hides/removes the gallery with no rebuild. Mirrors /public/services.
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
 * GET /api/v1/public/gallery
 * Auth: site token → tenant. Returns the owner's gallery images (newest first) when the `gallery`
 * feature is enabled, else `{ enabled:false, images:[] }`. Works in preview too.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "gallery", { limit: 120, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { clientId_key: { clientId: site.clientId, key: "gallery" } },
      select: { enabled: true },
    });
    // No caching: enabling/disabling the gallery and adding/removing photos must reflect on the
    // very next page load (the owner expects the change "as soon as" they make it). The query is
    // cheap (media rows scoped by an indexed clientId).
    const NO_CACHE = { "Cache-Control": "no-store" };
    const enabled = flag?.enabled === true;
    if (!enabled) {
      return json({ enabled: false, images: [] }, 200, NO_CACHE);
    }
    // Only real photos (exclude logo / documents) the owner has kept in the gallery. listMedia is
    // newest-first.
    const images = (await listMedia(site.clientId))
      .filter((m) => (m.kind ?? "image") === "image" && m.inGallery !== false)
      .map((m) => ({ url: m.url, alt: m.alt ?? m.name ?? "" }));
    return json({ enabled: true, images }, 200, NO_CACHE);
  } catch (err) {
    console.error("[GET /api/v1/public/gallery]", err);
    return json({ error: "internal_error" }, 500);
  }
}
