import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import type { BookingInput } from "./schema";

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
