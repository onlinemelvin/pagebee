import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { createManualBooking, manualBookingSchema, BookingError } from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/bookings — owner-created appointment (walk-in / phone). */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("appointments", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = manualBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const booking = await createManualBooking(client.id, parsed.data);
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/bookings]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
