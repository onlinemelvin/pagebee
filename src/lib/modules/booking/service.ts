import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { sendEmail } from "@/lib/modules/email";
import type { BookingInput } from "./schema";

export type BookingDecision = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export class BookingError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Ensure the tenant's plan has booking enabled; returns the client. */
async function assertBookingEnabled(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!client) throw new BookingError(404, "client_not_found");
  const flags = (client.subscription?.plan.featureFlags ?? {}) as unknown as Record<string, unknown>;
  if (!flags.booking) throw new BookingError(403, "feature_not_enabled");
  return client;
}

export interface CreateBookingParams {
  clientId: string; // resolved from the site token
  input: BookingInput;
  ip?: string | null;
}

/** Create an appointment request from a client website. */
export async function createBooking({ clientId, input, ip }: CreateBookingParams) {
  await assertBookingEnabled(clientId);

  // Link (or create) the end customer for this tenant.
  let customerId: string;
  const existing = input.email
    ? await prisma.customer.findFirst({ where: { clientId, email: input.email }, select: { id: true } })
    : null;
  if (existing) {
    customerId = existing.id;
  } else {
    const customer = await prisma.customer.create({
      data: { clientId, name: input.name, email: input.email, phone: input.phone },
    });
    customerId = customer.id;
  }

  const startAt = new Date(input.startAt);
  const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);

  const booking = await prisma.booking.create({
    data: {
      clientId,
      customerId,
      status: "REQUESTED",
      serviceName: input.serviceName,
      startAt,
      endAt,
      notes: input.notes,
    },
  });

  await writeAudit({ action: "booking.created", entityType: "Booking", entityId: booking.id, clientId, ip });
  await emit("booking.created", {
    booking,
    customer: { name: input.name, email: input.email, phone: input.phone },
  });

  return booking;
}

/** Bookings for a client's portal (newest upcoming first). */
export async function listBookings(clientId: string) {
  return prisma.booking.findMany({
    where: { clientId },
    orderBy: { startAt: "asc" },
    take: 200,
    include: { customer: true },
  });
}

/** Confirm/cancel/complete a booking and notify the customer on confirm/cancel. */
export async function updateBookingStatus(clientId: string, bookingId: string, status: BookingDecision) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId },
    include: { customer: true },
  });
  if (!booking) throw new BookingError(404, "not_found");

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status, ...(status === "CONFIRMED" ? { confirmationSentAt: new Date() } : {}) },
  });

  if (booking.customer?.email && (status === "CONFIRMED" || status === "CANCELLED")) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { businessName: true, ownerEmail: true },
    });
    const when = booking.startAt.toLocaleString();
    await sendEmail({
      to: booking.customer.email,
      subject:
        status === "CONFIRMED"
          ? `Your appointment is confirmed — ${booking.serviceName}`
          : `Your appointment was cancelled — ${booking.serviceName}`,
      html:
        status === "CONFIRMED"
          ? `<p>Your ${booking.serviceName} on ${when} is confirmed. See you then!</p><p>— ${client?.businessName ?? ""}</p>`
          : `<p>Unfortunately your ${booking.serviceName} on ${when} has been cancelled. Please reach out to reschedule.</p><p>— ${client?.businessName ?? ""}</p>`,
      replyTo: client?.ownerEmail ?? undefined,
    });
  }

  await writeAudit({ action: `booking.${status.toLowerCase()}`, entityType: "Booking", entityId: bookingId, clientId });
  return updated;
}

export interface Slot {
  startAt: string;
  label: string;
}

/**
 * Available appointment slots. Placeholder schedule (next 7 days, hourly 9am–5pm)
 * until per-client availability rules (ClientSetting.calendarSettings) are wired.
 */
export async function getAvailability(clientId: string, service?: string): Promise<Slot[]> {
  await assertBookingEnabled(clientId);
  void service; // reserved for service-specific availability once calendar rules land
  const slots: Slot[] = [];
  const now = new Date();
  for (let day = 1; day <= 7; day++) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date(date);
      d.setHours(hour, 0, 0, 0);
      slots.push({
        startAt: d.toISOString(),
        label: d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric" }),
      });
    }
  }
  return slots;
}
