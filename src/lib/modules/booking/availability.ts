import { WEEKDAYS, type DayHours, type SchedulingSettings, type Weekday } from "./schema";

// NOTE: times use the server's local timezone for now. Per-client timezones are a follow-up.

export interface DaySlots {
  date: string; // yyyy-mm-dd
  slots: { startAt: string; label: string }[];
}
export interface BusyInterval {
  startAt: Date;
  endAt: Date;
}

const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
 * Honors recurring off-days (closed weekdays), blocked dates, daily cap, min-notice / booking
 * window, slot length + buffer, and per-slot concurrency. Pure (no I/O) so it's easy to reuse
 * and test — the service loads settings + bookings and calls this.
 */
export function computeSlots(
  settings: SchedulingSettings,
  busy: BusyInterval[],
  opts: { from: Date; to: Date; durationMinutes: number; now?: Date },
): DaySlots[] {
  const now = opts.now ?? new Date();
  const minBookable = new Date(now.getTime() + settings.minNoticeHours * 3_600_000);
  const maxBookable = new Date(now.getTime() + settings.maxAdvanceDays * 86_400_000);
  const blocked = new Set(settings.blockedDates);
  const stepMs = (settings.slotMinutes + settings.bufferMinutes) * 60_000;
  const durMs = opts.durationMinutes * 60_000;

  const out: DaySlots[] = [];
  const cursor = new Date(opts.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(opts.to);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const dateStr = ymd(cursor);
    const day = settings.weekly[DOW[cursor.getDay()]] ?? defaultDay(DOW[cursor.getDay()]);
    const daySlots: { startAt: string; label: string }[] = [];

    const dayBusy = busy.filter((b) => ymd(b.startAt) === dateStr);
    const capReached = settings.dailyCap > 0 && dayBusy.length >= settings.dailyCap;

    if (!day.closed && !blocked.has(dateStr) && !capReached) {
      const [oh, om] = day.open.split(":").map(Number);
      const [ch, cm] = day.close.split(":").map(Number);
      const dayStart = new Date(cursor).setHours(oh, om, 0, 0);
      const dayClose = new Date(cursor).setHours(ch, cm, 0, 0);
      for (let t = dayStart; t + durMs <= dayClose; t += stepMs) {
        const slotStart = new Date(t);
        const slotEnd = new Date(t + durMs);
        if (slotStart < minBookable || slotStart > maxBookable) continue;
        const overlapping = busy.filter((b) => b.startAt < slotEnd && b.endAt > slotStart).length;
        if (overlapping < settings.concurrent) {
          daySlots.push({
            startAt: slotStart.toISOString(),
            label: slotStart.toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          });
        }
      }
    }

    out.push({ date: dateStr, slots: daySlots });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
