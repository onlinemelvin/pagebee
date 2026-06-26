import { describe, it, expect } from "vitest";
import { schedulingSettingsSchema } from "./schema";
import { isOpenNow, nextOpening, nextResponseEta } from "./hours";

// Default settings: Mon–Fri 09:00–17:00, weekends closed, America/New_York.
const settings = schedulingSettingsSchema.parse({ timezone: "America/New_York" });

describe("business hours", () => {
  it("is open mid-day on a weekday", () => {
    // 2026-06-22 is a Monday. 18:00Z = 14:00 EDT (UTC-4) → within 9–5.
    expect(isOpenNow(settings, new Date("2026-06-22T18:00:00Z"))).toBe(true);
  });

  it("is closed before opening on a weekday", () => {
    // 12:00Z = 08:00 EDT → before 9am.
    expect(isOpenNow(settings, new Date("2026-06-22T12:00:00Z"))).toBe(false);
  });

  it("is closed on the weekend", () => {
    // 2026-06-21 is a Sunday, 16:00Z = noon EDT.
    expect(isOpenNow(settings, new Date("2026-06-21T16:00:00Z"))).toBe(false);
  });

  it("nextOpening returns Monday 9am after a closed Sunday", () => {
    const open = nextOpening(settings, new Date("2026-06-21T16:00:00Z"));
    expect(open).not.toBeNull();
    // Monday 2026-06-22 09:00 EDT = 13:00Z.
    expect(open!.toISOString()).toBe("2026-06-22T13:00:00.000Z");
  });

  it("nextOpening returns now when already open", () => {
    const now = new Date("2026-06-22T18:00:00Z");
    expect(nextOpening(settings, now)).toBe(now);
  });

  it("after-hours ETA is a non-empty label (opening + 1h)", () => {
    const eta = nextResponseEta(settings, new Date("2026-06-21T16:00:00Z"));
    expect(eta).toMatch(/Monday/);
    expect(eta).toMatch(/10:00/); // 9am open + 1h
  });
});
