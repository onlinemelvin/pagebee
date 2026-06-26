import { WEEKDAYS, type SchedulingSettings, type Weekday } from "./schema";
import { normalizeSettings, defaultDay, safeTz, tzParts, zonedToUtc } from "./availability";

// "Is the business open right now?" + "when does it next open?" — computed in the business's IANA
// timezone, reusing the same DST-safe primitives as the availability engine. Used by the AI chat to
// decide whether to suggest calling now, or to give an after-hours ETA (next opening + 1 hour).

// getUTCDay() index → our Weekday key.
const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The business-local weekday + date for a UTC instant (noon-anchored, DST-safe like computeSlots). */
function localDay(utcMs: number, tz: string): { y: number; mo: number; d: number; dow: Weekday; ymd: string } {
  const p = tzParts(utcMs, tz);
  // Weekday of the business-local calendar date, via a noon-UTC anchor for that date.
  const dow = DOW[new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay()];
  const ymd = `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return { y: p.y, mo: p.mo, d: p.d, dow, ymd };
}

/** Open/close UTC instants for a given business-local date (null when closed/blocked that day). */
function dayWindow(settings: SchedulingSettings, y: number, mo: number, d: number, dow: Weekday, ymd: string, tz: string): { open: number; close: number } | null {
  const day = settings.weekly[dow] ?? defaultDay(dow);
  if (day.closed || settings.blockedDates.includes(ymd)) return null;
  const [oh, om] = day.open.split(":").map(Number);
  const [ch, cm] = day.close.split(":").map(Number);
  const open = zonedToUtc(y, mo, d, oh, om, tz);
  const close = zonedToUtc(y, mo, d, ch, cm, tz);
  return close > open ? { open, close } : null;
}

/** Is the business open at `now`? */
export function isOpenNow(raw: SchedulingSettings, now: Date = new Date()): boolean {
  const settings = normalizeSettings(raw);
  const tz = safeTz(settings.timezone);
  const ms = now.getTime();
  const today = localDay(ms, tz);
  const w = dayWindow(settings, today.y, today.mo, today.d, today.dow, today.ymd, tz);
  return !!w && ms >= w.open && ms < w.close;
}

/**
 * The next instant the business opens at or after `now`. Returns `now` when already open. Scans up to
 * 14 days ahead; returns null only if every day in that window is closed/blocked.
 */
export function nextOpening(raw: SchedulingSettings, now: Date = new Date()): Date | null {
  const settings = normalizeSettings(raw);
  const tz = safeTz(settings.timezone);
  const nowMs = now.getTime();
  if (isOpenNow(settings, now)) return now;
  for (let i = 0; i < 14; i++) {
    const probe = localDay(nowMs + i * 86_400_000, tz);
    const w = dayWindow(settings, probe.y, probe.mo, probe.d, probe.dow, probe.ymd, tz);
    if (w && w.open > nowMs) return new Date(w.open);
  }
  return null;
}

/**
 * Human ETA for an after-hours reply: "next opening + 1 hour", formatted in the business tz, e.g.
 * "tomorrow around 10:00 AM" → returns a label like "Mon around 10:00 AM". Null if no opening found.
 */
export function nextResponseEta(raw: SchedulingSettings, now: Date = new Date()): string | null {
  const settings = normalizeSettings(raw);
  const open = nextOpening(settings, now);
  if (!open) return null;
  const eta = new Date(open.getTime() + 3_600_000); // opening + 1h buffer
  return eta.toLocaleString("en-US", {
    timeZone: safeTz(settings.timezone),
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

export { WEEKDAYS };
