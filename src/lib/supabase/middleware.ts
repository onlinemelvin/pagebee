import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on each request. No-op until
 * Supabase env is configured, so the app runs offline during early dev.
 */
export async function updateSession(request: NextRequest) {
  // Expose the current path to server components (layouts can't read it otherwise) so account-status
  // gating can redirect blocked tenants to billing without a loop on the billing page itself.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Touch the session so expired tokens get refreshed into the response cookies.
    await supabase.auth.getUser();
  } catch (err) {
    // Never let session refresh break the request (e.g. missing WebSocket on the edge).
    console.error("[proxy] session refresh skipped:", err);
  }
  return response;
}
