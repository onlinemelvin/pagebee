import { WEEKDAYS, type DayHours, type SchedulingSettings, type Weekday } from "./schema";

// Availability is computed in the business's IANA timezone (settings.timezone). Day boundaries,
// open/close hours, and customer-facing labels are all resolved in that zone using Intl — so a
// customer booking from another timezone still sees the business's local hours, and DST is handled.

export interface DaySlots {
  date: string; // yyyy-mm-dd (business-local calendar date)
  slots: { startAt: string; label: string }[];
}
export interface BusyInterval {
  startAt: Date;
  endAt: Date;
}

const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const FALLBACK_TZ = "America/New_York";

/** Wall-clock parts of a UTC instant as observed in `tz`. */
function tzParts(utcMs: number, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** Offset (ms) of `tz` from UTC at a given instant: localWallTime - utcTime. */
function offsetMs(utcMs: number, tz: string): number {
  const p = tzParts(utcMs, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - utcMs;
}

/** UTC epoch ms for a wall-clock date/time in `tz`. Refines once to settle DST boundaries. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = offsetMs(guess, tz);
  const off2 = offsetMs(guess - off1, tz);
  return guess - off2;
}

/** Business-local calendar date (yyyy-mm-dd) of a UTC instant. */
function zonedYmd(utcMs: number, tz: string): string {
  const p = tzParts(utcMs, tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function safeTz(tz: string | undefined): string {
  if (!tz) return FALLBACK_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

/** Default hours for a weekday: open 9–5 Mon–Fri, closed on weekends. */
export function defaultDay(day: Weekday): DayHours {
  const weekend = day === "sat" || day === "sun";
  return { open: "09:00", close: "17:00", closed: weekend };
}

/** Fill every weekday so the engine never has to guess (stored config may be partial). */
export function normalizeSettings(parsed: SchedulingSettings): SchedulingSettings {
  const weekly = {} as SchedulingSettings["weekly"];
  for (const d of WEEKDAYS) weekly[d] = parsed.weekly?.[d] ?? defaultDay(d);
  return { ...parsed, weekly };
}

/**
 * Compute bookable slots over a date range from the owner's settings and existing bookings.
 * Honors the business timezone, recurring off-days (closed weekdays), blocked dates, daily cap,
 * min-notice / booking window, slot length + buffer, and per-slot concurrency. Pure (no I/O).
 */
export function computeSlots(
  settings: SchedulingSettings,
  busy: BusyInterval[],
  opts: { from: Date; to: Date; durationMinutes: number; now?: Date },
): DaySlots[] {
  const tz = safeTz(settings.timezone);
  const now = opts.now ?? new Date();
  const minBookable = now.getTime() + settings.minNoticeHours * 3_600_000;
  const maxBookable = now.getTime() + settings.maxAdvanceDays * 86_400_000;
  const blocked = new Set(settings.blockedDates);
  const stepMs = (settings.slotMinutes + settings.bufferMinutes) * 60_000;
  const durMs = opts.durationMinutes * 60_000;

  // Precompute the business-local date each busy interval falls on (for the daily cap).
  const busyDates = busy.map((b) => zonedYmd(b.startAt.getTime(), tz));

  // Iterate calendar dates in the business tz using a noon-UTC anchor (DST-safe day stepping).
  const fromYmd = tzParts(opts.from.getTime(), tz);
  const toYmd = tzParts(opts.to.getTime(), tz);
  let anchor = Date.UTC(fromYmd.y, fromYmd.mo - 1, fromYmd.d, 12);
  const endAnchor = Date.UTC(toYmd.y, toYmd.mo - 1, toYmd.d, 12);

  const out: DaySlots[] = [];
  while (anchor <= endAnchor) {
    const a = new Date(anchor);
    const y = a.getUTCFullYear();
    const mo = a.getUTCMonth() + 1;
    const d = a.getUTCDate();
    const dow = a.getUTCDay();
    const dateStr = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const day = settings.weekly[DOW[dow]] ?? defaultDay(DOW[dow]);
    const daySlots: { startAt: string; label: string }[] = [];

    const dayBusyCount = busyDates.filter((bd) => bd === dateStr).length;
    const capReached = settings.dailyCap > 0 && dayBusyCount >= settings.dailyCap;

    if (!day.closed && !blocked.has(dateStr) && !capReached) {
      const [oh, om] = day.open.split(":").map(Number);
      const [ch, cm] = day.close.split(":").map(Number);
      const dayStart = zonedToUtc(y, mo, d, oh, om, tz);
      const dayClose = zonedToUtc(y, mo, d, ch, cm, tz);
      for (let t = dayStart; t + durMs <= dayClose; t += stepMs) {
        const slotEnd = t + durMs;
        if (t < minBookable || t > maxBookable) continue;
        const overlapping = busy.filter((b) => b.startAt.getTime() < slotEnd && b.endAt.getTime() > t).length;
        if (overlapping < settings.concurrent) {
          daySlots.push({
            startAt: new Date(t).toISOString(),
            label: new Date(t).toLocaleString("en-US", {
              timeZone: tz,
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            }),
          });
        }
      }
    }

    out.push({ date: dateStr, slots: daySlots });
    anchor += 86_400_000;
  }
  return out;
}
