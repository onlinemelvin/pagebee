import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import {
  updateBookingStatus,
  rescheduleBooking,
  deleteBooking,
  getBookingHistory,
  rescheduleSchema,
  BookingError,
} from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.object({ status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]) });

/** GET /api/v1/client/bookings/{id} — change history for the booking (for the edit panel). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    const history = await getBookingHistory(client.id, id);
    return NextResponse.json({ history });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[GET /api/v1/client/bookings/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/client/bookings/{id} — update one of the caller's bookings. Body is either
 * { status } (confirm/cancel/complete/no-show) or { startAt, endAt? } (reschedule).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    // Reschedule when a new start time is supplied; otherwise treat it as a status change.
    if (body && typeof body.startAt === "string") {
      const parsed = rescheduleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
      }
      const booking = await rescheduleBooking(
        client.id,
        id,
        parsed.data.startAt,
        parsed.data.endAt,
        parsed.data.reason,
      );
      return NextResponse.json({ booking });
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
    }
    const booking = await updateBookingStatus(client.id, id, parsed.data.status);
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[PATCH /api/v1/client/bookings/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/** DELETE /api/v1/client/bookings/{id} — permanently remove one of the caller's bookings. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    await deleteBooking(client.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[DELETE /api/v1/client/bookings/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
