import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getOwnerSlots, BookingError } from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/client/bookings/availability?service=&date= — bookable slots for the owner's
 * reschedule / add-appointment pickers, grouped by day.
 */
export async function GET(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const url = new URL(req.url);
  const service = url.searchParams.get("service") ?? undefined;
  const date = url.searchParams.get("date") ?? undefined;

  try {
    const days = await getOwnerSlots(client.id, { service, date });
    return NextResponse.json({ days });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[GET /api/v1/client/bookings/availability]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
