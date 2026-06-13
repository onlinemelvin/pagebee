"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookingDetail } from "./BookingDetail";
import { DayTimeGrid } from "./DayTimeGrid";
import { WeekTimeGrid } from "./WeekTimeGrid";
import { AddAppointmentModal } from "./AddAppointmentModal";
import { localYmd, type Appt, type ApptService } from "./appointments-types";
import type { SchedulingSettings, Weekday } from "@/lib/modules/booking";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DKEY: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Each appointment is a thick line in the day cell; pending is a faded/dashed line, the rest solid.
const LINE: Record<string, string> = {
  REQUESTED: "border border-dashed border-amber-400 bg-amber-100",
  CONFIRMED: "bg-green-500",
  RESCHEDULED: "bg-blue-500",
  COMPLETED: "bg-teal-500",
  CANCELLED: "bg-stone-300",
  NO_SHOW: "bg-red-500",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AppointmentsManager({
  appointments,
  settings,
  services,
}: {
  appointments: Appt[];
  settings: SchedulingSettings;
  services: ApptService[];
}) {
  const today = ymd(new Date());
  const [monthStart, setMonthStart] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = React.useState<string>(today);
  const [view, setView] = React.useState<"day" | "week">("day");
  const [detail, setDetail] = React.useState<Appt | null>(null);
  const [add, setAdd] = React.useState(false);

  const byDay = React.useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appointments) {
      const k = localYmd(a.startAt);
      const arr = m.get(k);
      if (arr) arr.push(a);
      else m.set(k, [a]);
    }
    return m;
  }, [appointments]);
  const blocked = React.useMemo(() => new Set(settings.blockedDates), [settings.blockedDates]);

  const cells = React.useMemo(() => {
    const start = new Date(monthStart);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthStart]);

  const dayAppts = (byDay.get(selected) ?? []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));

  // Days of the week containing the selected date (Sunday-first, matching the month grid).
  const weekDays = React.useMemo(() => {
    const sel = new Date(`${selected}T00:00:00`);
    const start = new Date(sel);
    start.setDate(sel.getDate() - sel.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selected]);
  const weekKeys = React.useMemo(() => weekDays.map(ymd), [weekDays]);
  const weekAppts = React.useMemo(
    () => appointments.filter((a) => weekKeys.includes(localYmd(a.startAt))),
    [appointments, weekKeys],
  );
  const history = detail
    ? appointments.filter((a) => detail.customerId && a.customerId === detail.customerId && a.id !== detail.id)
    : [];

  return (
    <div className="mt-6">
      {appointments.length === 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm">
            <Plus size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-stone-900">No appointments yet</p>
            <p className="text-sm text-stone-600">Add a walk-in or phone booking manually, or set your hours so customers can book online.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setAdd(true)}><Plus size={16} /> Add appointment</Button>
            <Link href="/client/appointments/settings" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
              <SlidersHorizontal size={16} /> Set availability
            </Link>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAdd(true)}>
          <Plus size={16} /> Add appointment
        </Button>
        <Link
          href="/client/appointments/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
        >
          <SlidersHorizontal size={16} /> Availability
        </Link>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-400">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-amber-400" /> Pending</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Confirmed</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-100" /> Day off</span>
        </div>
      </div>

      {/* Month calendar (full width, large) */}
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-stone-900">
            {monthStart.toLocaleString([], { month: "long", year: "numeric" })}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                setMonthStart(new Date(d.getFullYear(), d.getMonth(), 1));
                setSelected(ymd(d));
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100"
            >
              Today
            </button>
            <button onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-stone-400">
          {WD.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const k = ymd(d);
            const inMonth = d.getMonth() === monthStart.getMonth();
            const appts = byDay.get(k) ?? [];
            const closed = settings.weekly[DKEY[d.getDay()]]?.closed ?? (d.getDay() === 0 || d.getDay() === 6);
            const isBlocked = blocked.has(k);
            return (
              <button
                key={i}
                onClick={() => setSelected(k)}
                className={cn(
                  "flex min-h-[96px] flex-col rounded-lg border p-2 text-left transition-colors",
                  k === selected ? "border-amber-400 ring-1 ring-amber-300" : "border-stone-100 hover:bg-stone-50",
                  isBlocked ? "bg-rose-50" : closed ? "bg-stone-100/70" : "bg-white",
                  !inMonth && "opacity-40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-semibold", k === today ? "grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-white" : "text-stone-700")}>
                    {d.getDate()}
                  </span>
                  {isBlocked && <span className="text-[9px] font-semibold uppercase text-rose-500">Off</span>}
                </div>
                {/* Mini day timeline: each appointment is a thick line placed by time of day —
                    morning near the top, midday in the center, evening at the bottom. */}
                <div className="relative mt-1 flex-1">
                  {appts.map((a) => {
                    const d = new Date(a.startAt);
                    const min = d.getHours() * 60 + d.getMinutes();
                    const frac = Math.min(1, Math.max(0, (min - 360) / 720)); // 6:00 (top) → 18:00 (bottom), noon = center
                    return (
                      <span
                        key={a.id}
                        title={`${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${a.serviceName}`}
                        style={{ top: `${frac * 100}%` }}
                        className={cn("absolute left-0 right-0 h-1.5 -translate-y-1/2 rounded-full", LINE[a.status] ?? "bg-stone-400")}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-day / week time view (Outlook-style) */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-stone-900">
            {view === "week"
              ? `${weekDays[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString([], { month: "short", day: "numeric" })}`
              : new Date(`${selected}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-400">
              {view === "week"
                ? `${weekAppts.length} this week`
                : `${dayAppts.length} appointment${dayAppts.length === 1 ? "" : "s"}`}
            </span>
            {/* Day / Week segmented toggle */}
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-sm">
              {(["day", "week"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium capitalize transition-colors",
                    view === v ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === "week" ? (
          <div className="mt-3">
            <WeekTimeGrid appts={weekAppts} weekDays={weekDays} snapMinutes={settings.slotMinutes} todayYmd={today} onSelect={setDetail} />
            <p className="mt-2 text-xs text-stone-400">Drag an appointment across columns to change its day, and up or down to change its time.</p>
          </div>
        ) : dayAppts.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-400">
            Nothing booked. Switch to Week to drag one here, or add one.
          </p>
        ) : (
          <div className="mt-3">
            <DayTimeGrid appts={dayAppts} snapMinutes={settings.slotMinutes} dateYmd={selected} onSelect={setDetail} />
            <p className="mt-2 text-xs text-stone-400">Drag an appointment to change its time, or click it to edit.</p>
          </div>
        )}
      </div>

      {detail && <BookingDetail appt={detail} history={history} onClose={() => setDetail(null)} />}
      {add && <AddAppointmentModal services={services} defaultDate={selected} onClose={() => setAdd(false)} />}
    </div>
  );
}
