import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { createBooking, bookingEnabled, bookingInputSchema, BookingError } from "@/lib/modules/booking";
import "@/lib/events/subscribers"; // register booking.created handlers
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * POST /api/v1/public/bookings — appointment request from a client website.
 * Auth: site token. Plan-gated (Connect/Automate).
 */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "bookings", { limit: 8, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const parsed = bookingInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "validation_error", issues: parsed.error.flatten() }, 400);
  }

  // Preview mode (before launch): accept but don't deliver — demo only.
  if (site.status === "preview") {
    return json({ id: "demo", status: "DEMO", demo: true }, 200);
  }

  // Respect the owner's dashboard toggle (plan + override), not just the plan. createBooking also
  // asserts the plan, but this honors an owner who turned booking off after launch.
  if (!(await bookingEnabled(site.clientId))) return json({ error: "booking_disabled" }, 403);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const booking = await createBooking({ clientId: site.clientId, input: parsed.data, ip });
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: `client:${site.clientId}`,
      event: "booking_created",
      properties: {
        clientId: site.clientId,
        bookingStatus: booking.status,
      },
    });
    return json({ id: booking.id, status: booking.status, startAt: booking.startAt }, 201);
  } catch (err) {
    if (err instanceof BookingError) return json({ error: err.code }, err.status);
    console.error("[POST /api/v1/public/bookings]", err);
    return json({ error: "internal_error" }, 500);
  }
}
