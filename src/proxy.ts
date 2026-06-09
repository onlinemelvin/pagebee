import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

// Next.js 16 "proxy" convention (formerly middleware).
// 1) Host-based multi-tenant routing: {slug}.<root> and custom domains render the
//    tenant site (rewritten to /_sites/...). 2) Otherwise refresh the Supabase session.
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

  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
