import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

// Pre-launch "coming soon" gate — applies ONLY to the root host (the PageBee app).
// Tenant sites (subdomains / custom domains) are never gated; they're handled above.
const BYPASS_COOKIE = "pb_preview";

function gateResponse(request: NextRequest, path: string): NextResponse | null {
  if (process.env.COMING_SOON !== "true") return null;

  const bypassKey = process.env.PREVIEW_BYPASS_KEY;
  const { searchParams } = request.nextUrl;

  // 1) Magic link: ?preview=<key> sets a durable cookie, then redirects to a clean URL.
  if (bypassKey && searchParams.get("preview") === bypassKey) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("preview");
    const res = NextResponse.redirect(clean);
    res.cookies.set(BYPASS_COOKIE, bypassKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: "/",
    });
    return res;
  }

  // 2) The gate page itself and APIs are always reachable (webhooks + waitlist submit).
  if (path === "/coming-soon" || path.startsWith("/api")) return null;

  // 3) Valid bypass cookie → through.
  if (bypassKey && request.cookies.get(BYPASS_COOKIE)?.value === bypassKey) return null;

  // 4) Allow-listed IPs → through.
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip"))?.trim();
  const allowed = (process.env.PREVIEW_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ip && allowed.includes(ip)) return null;

  // 5) Everyone else sees the coming-soon page (URL preserved).
  return NextResponse.rewrite(new URL("/coming-soon", request.url));
}

// Next.js 16 "proxy" convention (formerly middleware).
// 1) Host-based multi-tenant routing: {slug}.<root> and custom domains render the
//    tenant site (rewritten to /_sites/...). 2) Otherwise apply the pre-launch gate,
//    then refresh the Supabase session.
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const path = request.nextUrl.pathname;

  const isRootHost =
    !host || host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}` || host === `app.${ROOT_DOMAIN}`;
  // Never rewrite API, Next internals, or the rewrite target itself.
  const isReserved = path.startsWith("/api") || path.startsWith("/_next") || path.startsWith("/sites");

  if (!isRootHost && !isReserved) {
    const url = request.nextUrl.clone();
    if (host.endsWith(`.${ROOT_DOMAIN}`)) {
      const subdomain = host.slice(0, host.length - ROOT_DOMAIN.length - 1);
      url.pathname = `/sites/s/${subdomain}${path === "/" ? "" : path}`;
    } else {
      url.pathname = `/sites/d/${encodeURIComponent(host)}${path === "/" ? "" : path}`;
    }
    return NextResponse.rewrite(url);
  }

  // Root host only: gate the app behind "coming soon" while pre-launch.
  const gated = gateResponse(request, path);
  if (gated) return gated;

  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
