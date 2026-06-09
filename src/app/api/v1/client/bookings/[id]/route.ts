import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { updateBookingStatus, BookingError } from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]) });

/** PATCH /api/v1/client/bookings/{id} — confirm/cancel/complete one of the caller's bookings. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const booking = await updateBookingStatus(client.id, id, parsed.data.status);
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[PATCH /api/v1/client/bookings/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
