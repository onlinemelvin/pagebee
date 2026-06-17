import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/modules/email";
import { getServiceDurations } from "@/lib/modules/service";
import { defaultBookingHtml, type BookingMeta } from "@/lib/site/booking";
import { schedulingSettingsSchema, type BookingInput, type ManualBookingInput, type SchedulingSettings } from "./schema";
import { computeSlots, normalizeSettings, type BusyInterval, type DaySlots } from "./availability";

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

/**
 * Whether the public booking widget is live for a tenant: the plan includes `booking` AND the owner
 * hasn't turned it off via the feature card. Mirrors leadCaptureEnabled — used by the public booking
 * status feed (serve-time show/hide) and to gate public booking submissions. Default-on when on-plan.
 */
export async function bookingEnabled(clientId: string): Promise<boolean> {
  const [client, override] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { subscription: { select: { plan: { select: { featureFlags: true } } } } },
    }),
    prisma.featureFlag.findUnique({
      where: { clientId_key: { clientId, key: "booking" } },
      select: { enabled: true },
    }),
  ]);
  const planFlags = (client?.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  if (!planFlags.booking) return false; // not on this plan
  return override?.enabled !== false; // default-on unless explicitly disabled
}

/**
 * Serve-time booking state for a tenant: whether the widget is live + the trigger section to show.
 * Mirrors getLeadFormMeta — falls back to a platform-default trigger so booking works on EXISTING
 * booking-enabled sites with no rebuild (the AI's tailored section is used once a site is regenerated).
 * Returns null only for sites that can never show booking (not on plan / owner-off AND no stored
 * section), so the serve pipeline injects nothing there.
 */
export async function getBookingMeta(clientId: string, bookingHtml: string | null): Promise<BookingMeta | null> {
  const enabled = await bookingEnabled(clientId);
  if (!enabled && !bookingHtml) return null;
  return { enabled, html: bookingHtml ?? defaultBookingHtml() };
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

  // Enforce the concurrency limit even when the public form picked a time outside the slot list.
  const settings = await getSchedulingSettings(clientId);
  await assertSlotFree(clientId, startAt, endAt, settings.concurrent);

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

/** Bookings for a client's portal (soonest first), optionally within a date range (calendar month). */
export async function listBookings(clientId: string, range?: { from?: Date; to?: Date }) {
  const startAt =
    range?.from || range?.to
      ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
      : undefined;
  return prisma.booking.findMany({
    where: { clientId, ...(startAt ? { startAt } : {}) },
    orderBy: { startAt: "asc" },
    take: 500,
    include: { customer: true },
  });
}

/** A customer's appointment history (for the quick-view detail). */
export async function getCustomerHistory(clientId: string, customerId: string) {
  return prisma.booking.findMany({
    where: { clientId, customerId },
    orderBy: { startAt: "desc" },
    take: 50,
    select: { id: true, serviceName: true, startAt: true, status: true },
  });
}

/** Format an instant in the business's timezone for customer-facing emails. */
function whenInTz(d: Date, tz: string): string {
  try {
    return d.toLocaleString("en-US", {
      timeZone: tz, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return d.toLocaleString();
  }
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
    const tz = (await getSchedulingSettings(clientId)).timezone;
    const when = whenInTz(booking.startAt, tz);
    await sendEmail({
      to: booking.customer.email,
      subject:
        status === "CONFIRMED"
          ? `Your appointment is confirmed — ${booking.serviceName}`
          : `Your appointment was cancelled — ${booking.serviceName}`,
      html:
        status === "CONFIRMED"
          ? `<p>Your ${escapeHtml(booking.serviceName)} on ${when} is confirmed. See you then!</p><p>— ${escapeHtml(client?.businessName ?? "")}</p>`
          : `<p>Unfortunately your ${escapeHtml(booking.serviceName)} on ${when} has been cancelled. Please reach out to reschedule.</p><p>— ${escapeHtml(client?.businessName ?? "")}</p>`,
      replyTo: client?.ownerEmail ?? undefined,
    });
  }

  await writeAudit({ action: `booking.${status.toLowerCase()}`, entityType: "Booking", entityId: bookingId, clientId });
  return updated;
}

/** Permanently remove a booking (hard delete) — frees its slot. Owner-only; scoped by clientId. */
export async function deleteBooking(clientId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, clientId }, select: { id: true } });
  if (!booking) throw new BookingError(404, "not_found");
  await prisma.booking.delete({ where: { id: bookingId } });
  await writeAudit({ action: "booking.deleted", entityType: "Booking", entityId: bookingId, clientId });
  return { id: bookingId };
}

export interface Slot {
  startAt: string;
  label: string;
}

/**
 * Send reminder emails for confirmed appointments starting within `hoursAhead` (default 24h)
 * that haven't been reminded yet. Idempotent: sets `reminderSentAt` on success, so a failed
 * send is retried on the next sweep. Called periodically by the background worker.
 */
export async function sweepBookingReminders(opts?: { hoursAhead?: number }): Promise<{ sent: number }> {
  const hoursAhead = opts?.hoursAhead ?? 24;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + hoursAhead * 3_600_000);

  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      reminderSentAt: null,
      startAt: { gt: now, lte: windowEnd },
      customer: { is: { email: { not: null } } },
    },
    include: { customer: true, client: { select: { businessName: true, ownerEmail: true } } },
    take: 100,
  });

  const tzCache = new Map<string, string>();
  let sent = 0;
  for (const b of due) {
    const email = b.customer?.email;
    if (!email) continue;
    let tz = tzCache.get(b.clientId);
    if (!tz) {
      tz = (await getSchedulingSettings(b.clientId)).timezone;
      tzCache.set(b.clientId, tz);
    }
    try {
      await sendEmail({
        to: email,
        subject: `Reminder: ${b.serviceName} — ${whenInTz(b.startAt, tz)}`,
        html: `<p>Just a friendly reminder of your <strong>${escapeHtml(b.serviceName)}</strong> on ${whenInTz(b.startAt, tz)}.</p><p>See you then!</p><p>— ${escapeHtml(b.client.businessName)}</p>`,
        replyTo: b.client.ownerEmail ?? undefined,
      });
      await prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } catch {
      // Leave reminderSentAt null so the next sweep retries this booking.
    }
  }
  return { sent };
}

// ── Scheduling settings (stored in ClientSetting.calendarSettings) ──

/** The client's availability rules, with all weekdays filled (defaults Mon–Fri 9–5, weekends off). */
export async function getSchedulingSettings(clientId: string): Promise<SchedulingSettings> {
  const cs = await prisma.clientSetting.findUnique({
    where: { clientId },
    select: { calendarSettings: true },
  });
  const parsed = cs?.calendarSettings ? schedulingSettingsSchema.safeParse(cs.calendarSettings) : null;
  return normalizeSettings(parsed?.success ? parsed.data : schedulingSettingsSchema.parse({}));
}

/** Validate + persist the client's scheduling settings (throws ZodError on bad input). */
export async function saveSchedulingSettings(clientId: string, input: unknown): Promise<SchedulingSettings> {
  const parsed = schedulingSettingsSchema.parse(input);
  const value = parsed as unknown as Prisma.InputJsonValue;
  await prisma.clientSetting.upsert({
    where: { clientId },
    update: { calendarSettings: value },
    create: { clientId, calendarSettings: value },
  });
  await writeAudit({ action: "booking.settings_updated", entityType: "ClientSetting", entityId: clientId, clientId });
  return normalizeSettings(parsed);
}

/** Existing bookings that occupy time (everything but cancelled / no-show) in a window. */
async function loadBusy(clientId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  return prisma.booking.findMany({
    where: { clientId, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startAt: { gte: from, lte: to } },
    select: { startAt: true, endAt: true },
  });
}

/**
 * Server-side concurrency guard: throws `slot_unavailable` if accepting [startAt, endAt) would
 * exceed the plan's concurrent limit. The availability engine only *hides* full slots in the UI;
 * this enforces it on every write (public form, manual add, reschedule) — closing races and any
 * path that picked a time outside the slot list.
 */
async function assertSlotFree(
  clientId: string,
  startAt: Date,
  endAt: Date,
  concurrent: number,
  excludeId?: string,
): Promise<void> {
  const overlapping = await prisma.booking.count({
    where: {
      clientId,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlapping >= Math.max(1, concurrent)) throw new BookingError(409, "slot_unavailable");
}

/** Typical duration for a service title, read from the central catalog; falls back to the slot length. */
async function durationFor(clientId: string, settings: SchedulingSettings, service?: string): Promise<number> {
  if (!service) return settings.slotMinutes;
  const durations = await getServiceDurations(clientId);
  return durations.get(service) ?? settings.slotMinutes;
}

/**
 * Available appointment slots for the public booking widget — flat list over the booking window,
 * computed from the owner's real availability rules + existing bookings (see availability.ts).
 */
export async function getAvailability(clientId: string, service?: string): Promise<Slot[]> {
  await assertBookingEnabled(clientId);
  const settings = await getSchedulingSettings(clientId);
  const from = new Date();
  const to = new Date(from.getTime() + settings.maxAdvanceDays * 86_400_000);
  const busy = await loadBusy(clientId, from, to);
  return computeSlots(settings, busy, { from, to, durationMinutes: await durationFor(clientId, settings, service) }).flatMap(
    (d) => d.slots,
  );
}

/** Owner-side slots grouped by day — for the reschedule + add-appointment pickers. */
export async function getOwnerSlots(
  clientId: string,
  opts: { service?: string; date?: string },
): Promise<DaySlots[]> {
  await assertBookingEnabled(clientId);
  const settings = await getSchedulingSettings(clientId);
  const from = opts.date ? new Date(`${opts.date}T00:00:00`) : new Date();
  const to = opts.date ? new Date(`${opts.date}T23:59:59`) : new Date(from.getTime() + settings.maxAdvanceDays * 86_400_000);
  const busy = await loadBusy(clientId, from, to);
  return computeSlots(settings, busy, { from, to, durationMinutes: await durationFor(clientId, settings, opts.service) });
}

/** Reschedule a booking to a new time, mark it RESCHEDULED, notify the customer, and record the
 *  change (old → new time + optional reason) in the audit trail — see getBookingHistory. */
export async function rescheduleBooking(
  clientId: string,
  bookingId: string,
  startAtStr: string,
  endAtStr?: string,
  reason?: string,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId },
    include: { customer: true },
  });
  if (!booking) throw new BookingError(404, "not_found");

  const startAt = new Date(startAtStr);
  const endAt = endAtStr
    ? new Date(endAtStr)
    : new Date(startAt.getTime() + (booking.endAt.getTime() - booking.startAt.getTime()));
  const fromStartAt = booking.startAt.toISOString();

  // Don't let a reschedule overbook a slot (excluding this booking itself).
  const settings = await getSchedulingSettings(clientId);
  await assertSlotFree(clientId, startAt, endAt, settings.concurrent, bookingId);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { startAt, endAt, status: "RESCHEDULED", confirmationSentAt: null },
  });

  if (booking.customer?.email) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { businessName: true, ownerEmail: true },
    });
    await sendEmail({
      to: booking.customer.email,
      subject: `Your appointment was rescheduled — ${booking.serviceName}`,
      html: `<p>Your ${escapeHtml(booking.serviceName)} has been moved to ${whenInTz(startAt, settings.timezone)}. Reply if that doesn't work for you.</p><p>— ${escapeHtml(client?.businessName ?? "")}</p>`,
      replyTo: client?.ownerEmail ?? undefined,
    });
  }

  await writeAudit({
    action: "booking.rescheduled",
    entityType: "Booking",
    entityId: bookingId,
    clientId,
    metadata: { fromStartAt, toStartAt: startAt.toISOString(), reason: reason ?? null },
  });
  return updated;
}

export interface BookingChange {
  action: string;
  fromStartAt?: string;
  toStartAt?: string;
  reason?: string | null;
  at: string;
}

/** Change history for one booking (reschedules + status changes), newest first. */
export async function getBookingHistory(clientId: string, bookingId: string): Promise<BookingChange[]> {
  const exists = await prisma.booking.findFirst({ where: { id: bookingId, clientId }, select: { id: true } });
  if (!exists) throw new BookingError(404, "not_found");
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "Booking", entityId: bookingId, action: { startsWith: "booking." } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { action: true, metadata: true, createdAt: true },
  });
  return logs.map((l) => {
    const m = (l.metadata ?? {}) as { fromStartAt?: string; toStartAt?: string; reason?: string | null };
    return {
      action: l.action,
      fromStartAt: m.fromStartAt,
      toStartAt: m.toStartAt,
      reason: m.reason ?? null,
      at: l.createdAt.toISOString(),
    };
  });
}

/** Owner-created booking (walk-in / phone). Confirmed on creation; reuses the customer link. */
export async function createManualBooking(clientId: string, input: ManualBookingInput) {
  await assertBookingEnabled(clientId);

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

  const settings = await getSchedulingSettings(clientId);
  const duration = input.durationMinutes ?? (await durationFor(clientId, settings, input.serviceName));
  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  await assertSlotFree(clientId, startAt, endAt, settings.concurrent);

  const booking = await prisma.booking.create({
    data: {
      clientId,
      customerId,
      status: "CONFIRMED",
      serviceName: input.serviceName,
      startAt,
      endAt,
      notes: input.notes,
      confirmationSentAt: new Date(),
    },
  });
  await writeAudit({ action: "booking.created_manual", entityType: "Booking", entityId: booking.id, clientId });
  return booking;
}
