import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { getAvailability, BookingError } from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/v1/public/booking/availability?service=<name> — open slots (site token, plan-gated). */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "availability", { limit: 40, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  const service = new URL(req.url).searchParams.get("service") ?? undefined;
  try {
    const slots = await getAvailability(site.clientId, service);
    return json({ slots }, 200);
  } catch (err) {
    if (err instanceof BookingError) return json({ error: err.code }, err.status);
    console.error("[GET /api/v1/public/booking/availability]", err);
    return json({ error: "internal_error" }, 500);
  }
}
