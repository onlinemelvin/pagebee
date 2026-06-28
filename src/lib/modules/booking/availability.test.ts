import { describe, it, expect } from "vitest";
import { schedulingSettingsSchema } from "./schema";
import {
  tzParts,
  zonedToUtc,
  safeTz,
  defaultDay,
  normalizeSettings,
  computeSlots,
  type BusyInterval,
} from "./availability";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Default Mon–Fri 9–5 settings in New York. */
const baseSettings = schedulingSettingsSchema.parse({ timezone: "America/New_York" });

// ── tzParts ───────────────────────────────────────────────────────────────────

describe("tzParts", () => {
  it("returns correct year/month/day/hour for a known UTC instant in New York (EDT, UTC-4)", () => {
    // 2026-07-01T14:30:00Z = 10:30 EDT
    const p = tzParts(new Date("2026-07-01T14:30:00Z").getTime(), "America/New_York");
    expect(p.y).toBe(2026);
    expect(p.mo).toBe(7);
    expect(p.d).toBe(1);
    expect(p.h).toBe(10);
    expect(p.mi).toBe(30);
  });

  it("wraps hour 24 → 0 (hour12:false Intl quirk)", () => {
    // Midnight UTC on a day where NY is already the same calendar day
    // 2026-07-01T04:00:00Z = 2026-07-01 00:00 EDT
    const p = tzParts(new Date("2026-07-01T04:00:00Z").getTime(), "America/New_York");
    expect(p.h).toBe(0);
  });
});

// ── zonedToUtc ────────────────────────────────────────────────────────────────

describe("zonedToUtc", () => {
  it("converts New York wall time → UTC correctly during EDT (UTC-4)", () => {
    // 2026-07-01 09:00 EDT = 2026-07-01T13:00:00Z
    const utc = zonedToUtc(2026, 7, 1, 9, 0, "America/New_York");
    expect(new Date(utc).toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("round-trips: tzParts(zonedToUtc(...)) gives back the original wall time", () => {
    const utc = zonedToUtc(2026, 12, 25, 15, 30, "America/New_York");
    const back = tzParts(utc, "America/New_York");
    expect(back.y).toBe(2026);
    expect(back.mo).toBe(12);
    expect(back.d).toBe(25);
    expect(back.h).toBe(15);
    expect(back.mi).toBe(30);
  });
});

// ── safeTz ────────────────────────────────────────────────────────────────────

describe("safeTz", () => {
  it("returns the valid timezone unchanged", () => {
    expect(safeTz("America/Chicago")).toBe("America/Chicago");
  });

  it("falls back to America/New_York for an invalid zone", () => {
    expect(safeTz("Mars/Olympus")).toBe("America/New_York");
  });

  it("falls back for undefined", () => {
    expect(safeTz(undefined)).toBe("America/New_York");
  });
});

// ── defaultDay ────────────────────────────────────────────────────────────────

describe("defaultDay", () => {
  it("weekday defaults to 9–5, not closed", () => {
    const d = defaultDay("mon");
    expect(d.open).toBe("09:00");
    expect(d.close).toBe("17:00");
    expect(d.closed).toBe(false);
  });

  it("weekend days default to closed", () => {
    expect(defaultDay("sat").closed).toBe(true);
    expect(defaultDay("sun").closed).toBe(true);
  });
});

// ── normalizeSettings ─────────────────────────────────────────────────────────

describe("normalizeSettings", () => {
  it("fills missing weekdays with defaults", () => {
    const partial = schedulingSettingsSchema.parse({ timezone: "America/New_York" });
    const norm = normalizeSettings({ ...partial, weekly: {} as never });
    for (const d of ["mon", "tue", "wed", "thu", "fri"] as const) {
      expect(norm.weekly[d]!.closed).toBe(false);
    }
    expect(norm.weekly.sat!.closed).toBe(true);
    expect(norm.weekly.sun!.closed).toBe(true);
  });

  it("preserves explicitly set values", () => {
    const parsed = schedulingSettingsSchema.parse({
      timezone: "America/New_York",
      weekly: { mon: { open: "08:00", close: "16:00", closed: false } },
    });
    const norm = normalizeSettings(parsed);
    expect(norm.weekly.mon!.open).toBe("08:00");
    expect(norm.weekly.mon!.close).toBe("16:00");
  });
});

// ── computeSlots ─────────────────────────────────────────────────────────────

describe("computeSlots", () => {
  it("returns slots for an open weekday within the min-notice window", () => {
    // now = Wed 2026-07-01 08:00 EDT (12:00 UTC); minNotice=2h → slots from 10:00 EDT
    const now = new Date("2026-07-01T12:00:00Z");
    const from = now;
    const to = new Date("2026-07-01T23:59:59Z");
    const result = computeSlots(baseSettings, [], { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-01");
    expect(day).toBeDefined();
    // 9am is filtered out by minNotice; at least 10am+ should appear
    expect(day!.slots.length).toBeGreaterThan(0);
    // First slot should be at or after 10am EDT (14:00 UTC)
    const firstSlot = day!.slots[0];
    expect(new Date(firstSlot.startAt).getTime()).toBeGreaterThanOrEqual(new Date("2026-07-01T14:00:00Z").getTime());
  });

  it("returns no slots for a closed weekday (Saturday)", () => {
    // 2026-07-04 is a Saturday
    const now = new Date("2026-07-04T13:00:00Z");
    const from = now;
    const to = new Date("2026-07-04T23:59:59Z");
    const result = computeSlots(baseSettings, [], { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-04");
    expect(day?.slots).toHaveLength(0);
  });

  it("blocks a slot when a busy interval overlaps and concurrent = 1", () => {
    // 2026-07-06 is a Monday; 13:00 UTC = 09:00 EDT
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const busy: BusyInterval[] = [
      // 9am–10am EDT slot occupied
      { startAt: new Date("2026-07-06T13:00:00Z"), endAt: new Date("2026-07-06T14:00:00Z") },
    ];
    const result = computeSlots(baseSettings, busy, { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    const nineAm = day?.slots.find((s) => s.startAt === "2026-07-06T13:00:00.000Z");
    expect(nineAm).toBeUndefined();
  });

  it("allows concurrent=2 slots when only one booking exists in the slot", () => {
    const settings2 = schedulingSettingsSchema.parse({ timezone: "America/New_York", concurrent: 2 });
    const normSettings = normalizeSettings(settings2);
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const busy: BusyInterval[] = [
      { startAt: new Date("2026-07-06T13:00:00Z"), endAt: new Date("2026-07-06T14:00:00Z") },
    ];
    const result = computeSlots(normSettings, busy, { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    const nineAm = day?.slots.find((s) => s.startAt === "2026-07-06T13:00:00.000Z");
    // concurrent=2, only 1 busy → slot still available
    expect(nineAm).toBeDefined();
  });

  it("blocks a slot when concurrent=2 and both positions are taken", () => {
    const settings2 = schedulingSettingsSchema.parse({ timezone: "America/New_York", concurrent: 2 });
    const normSettings = normalizeSettings(settings2);
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const busy: BusyInterval[] = [
      { startAt: new Date("2026-07-06T13:00:00Z"), endAt: new Date("2026-07-06T14:00:00Z") },
      { startAt: new Date("2026-07-06T13:00:00Z"), endAt: new Date("2026-07-06T14:00:00Z") },
    ];
    const result = computeSlots(normSettings, busy, { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    const nineAm = day?.slots.find((s) => s.startAt === "2026-07-06T13:00:00.000Z");
    expect(nineAm).toBeUndefined();
  });

  it("respects a blocked date (no slots even if otherwise open)", () => {
    const settings = schedulingSettingsSchema.parse({
      timezone: "America/New_York",
      blockedDates: ["2026-07-06"],
    });
    const norm = normalizeSettings(settings);
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const result = computeSlots(norm, [], { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    expect(day?.slots).toHaveLength(0);
  });

  it("enforces the daily cap when bookings reach it", () => {
    const settings = schedulingSettingsSchema.parse({
      timezone: "America/New_York",
      dailyCap: 1,
    });
    const norm = normalizeSettings(settings);
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const busy: BusyInterval[] = [
      // Any booking on the same business-local date counts toward the cap
      { startAt: new Date("2026-07-06T13:00:00Z"), endAt: new Date("2026-07-06T14:00:00Z") },
    ];
    const result = computeSlots(norm, busy, { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    // cap=1, 1 booking already → whole day hidden
    expect(day?.slots).toHaveLength(0);
  });

  it("strips slots beyond the maxAdvanceDays window", () => {
    const settings = schedulingSettingsSchema.parse({
      timezone: "America/New_York",
      maxAdvanceDays: 1,
    });
    const norm = normalizeSettings(settings);
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-09T23:59:59Z"); // request 4 days
    const result = computeSlots(norm, [], { from, to, durationMinutes: 60, now });
    // Slots on days far beyond maxAdvanceDays should be empty
    const day3 = result.find((r) => r.date === "2026-07-09");
    expect(day3?.slots).toHaveLength(0);
  });

  it("only counts non-overlapping busy intervals per slot", () => {
    // A busy interval entirely BEFORE or AFTER the slot must not block it.
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const busy: BusyInterval[] = [
      // 10am–11am EDT — does NOT overlap 9am–10am slot
      { startAt: new Date("2026-07-06T14:00:00Z"), endAt: new Date("2026-07-06T15:00:00Z") },
    ];
    const result = computeSlots(baseSettings, busy, { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    const nineAm = day?.slots.find((s) => s.startAt === "2026-07-06T13:00:00.000Z");
    expect(nineAm).toBeDefined();
  });

  it("slot label is a human-readable local string (contains day and time info)", () => {
    const now = new Date("2026-07-06T00:00:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const result = computeSlots(baseSettings, [], { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    expect(day!.slots.length).toBeGreaterThan(0);
    const label = day!.slots[0].label;
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns an entry for every calendar day in the range, even closed ones", () => {
    // Use noon UTC (08:00 EDT) so the business-local calendar date is clearly Mon 2026-07-06.
    const now = new Date("2026-07-06T16:00:00Z"); // noon EDT = 16:00 UTC
    const from = now;
    // to = Fri 2026-07-10 noon EDT = 16:00 UTC → 5 days (Mon–Fri)
    const to = new Date("2026-07-10T16:00:00Z");
    const result = computeSlots(baseSettings, [], { from, to, durationMinutes: 60, now });
    expect(result).toHaveLength(5);
  });

  it("respects minNoticeHours by excluding too-soon slots", () => {
    // now = 2026-07-06 08:59 EDT (12:59 UTC); minNotice=2h → nothing before 10:59 EDT
    const now = new Date("2026-07-06T12:59:00Z");
    const from = now;
    const to = new Date("2026-07-06T23:59:59Z");
    const result = computeSlots(baseSettings, [], { from, to, durationMinutes: 60, now });
    const day = result.find((r) => r.date === "2026-07-06");
    for (const slot of day?.slots ?? []) {
      expect(new Date(slot.startAt).getTime()).toBeGreaterThanOrEqual(now.getTime() + 2 * 3_600_000);
    }
  });
});
