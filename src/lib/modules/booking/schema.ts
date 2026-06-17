import { z } from "zod";

export const bookingInputSchema = z.object({
  serviceName: z.string().trim().min(1, "Service is required").max(160),
  startAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date/time" }),
  endAt: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().email("Enter a valid email").max(200).optional(),
  ),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

// ── Scheduling / availability settings (stored in ClientSetting.calendarSettings) ──
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayHoursSchema = z.object({
  open: z.string().regex(HHMM).default("09:00"),
  close: z.string().regex(HHMM).default("17:00"),
  closed: z.boolean().default(false),
});

const weeklySchema = z
  .object({
    mon: dayHoursSchema.optional(),
    tue: dayHoursSchema.optional(),
    wed: dayHoursSchema.optional(),
    thu: dayHoursSchema.optional(),
    fri: dayHoursSchema.optional(),
    sat: dayHoursSchema.optional(),
    sun: dayHoursSchema.optional(),
  })
  .default({});

export const schedulingSettingsSchema = z.object({
  // IANA timezone the business operates in. Availability hours, day boundaries, and the
  // times shown to customers are all computed in this zone (independent of server/browser tz).
  timezone: z.string().min(1).max(64).default("America/New_York"),
  weekly: weeklySchema,
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
  concurrent: z.number().int().min(1).max(50).default(1),
  slotMinutes: z.number().int().min(5).max(480).default(60),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  minNoticeHours: z.number().int().min(0).max(720).default(2),
  maxAdvanceDays: z.number().int().min(1).max(365).default(30),
  dailyCap: z.number().int().min(0).max(100).default(0), // 0 = unlimited
  // Services live in the central catalog (see modules/service); per-service durations are read
  // from there. `slotMinutes` is the fallback when a booking has no matching catalog service.
});
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;
export type DayHours = z.infer<typeof dayHoursSchema>;

// Owner-created (walk-in / phone) booking.
export const manualBookingSchema = z.object({
  serviceName: z.string().trim().min(1, "Service is required").max(160),
  startAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date/time" }),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().email("Enter a valid email").max(200).optional(),
  ),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

export const rescheduleSchema = z.object({
  startAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date/time" }),
  endAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date/time" }).optional(),
  reason: z.string().trim().max(500).optional(),
});
