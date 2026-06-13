"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Appt } from "./appointments-types";

const START_HOUR = 7;
const END_HOUR = 21;
const PX_PER_MIN = 0.7; // denser than the day view since seven columns share the width
const GRID_START_MIN = START_HOUR * 60;
const GRID_MIN = (END_HOUR - START_HOUR) * 60;
const HEIGHT = GRID_MIN * PX_PER_MIN;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BLOCK_STYLES: Record<string, string> = {
  REQUESTED: "border-dashed border-amber-400 bg-amber-50/80 text-amber-900",
  CONFIRMED: "border-green-400 bg-green-100 text-green-900",
  RESCHEDULED: "border-blue-400 bg-blue-100 text-blue-900",
  COMPLETED: "border-teal-400 bg-teal-100 text-teal-900",
  CANCELLED: "border-stone-300 bg-stone-100 text-stone-500 line-through",
  NO_SHOW: "border-red-400 bg-red-100 text-red-800",
};

function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function durationMin(a: Appt): number {
  return Math.max(15, (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Side-by-side lanes for overlapping appointments within a single day's column. */
function laneLayout(appts: Appt[]): Map<string, { col: number; cols: number }> {
  const sorted = [...appts].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const pos = new Map<string, { col: number; cols: number }>();
  let cluster: string[] = [];
  let lanes: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = lanes.length || 1;
    for (const id of cluster) pos.get(id)!.cols = cols;
    cluster = [];
    lanes = [];
    clusterEnd = -Infinity;
  };
  for (const a of sorted) {
    const s = minutesOf(a.startAt);
    const e = s + durationMin(a);
    if (cluster.length && s >= clusterEnd) flush();
    let col = lanes.findIndex((end) => end <= s);
    if (col === -1) {
      col = lanes.length;
      lanes.push(e);
    } else {
      lanes[col] = e;
    }
    pos.set(a.id, { col, cols: 1 });
    cluster.push(a.id);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return pos;
}

/**
 * A seven-column week grid. Drag a block sideways into another day's column and/or up/down to a
 * new time — both the day and the time change in one gesture, then PATCH reschedule.
 */
export function WeekTimeGrid({
  appts,
  weekDays,
  snapMinutes,
  todayYmd,
  onSelect,
}: {
  appts: Appt[];
  weekDays: Date[];
  snapMinutes: number;
  todayYmd: string;
  onSelect: (a: Appt) => void;
}) {
  const router = useRouter();
  const snap = Math.max(5, snapMinutes || 30);
  const colsRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<{ id: string; deltaMin: number; col: number; moved: boolean } | null>(null);
  const dragData = React.useRef<{ appt: Appt; startY: number; originCol: number; deltaMin: number; col: number; moved: boolean } | null>(null);

  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dayKeys = React.useMemo(() => weekDays.map(ymd), [weekDays]);
  const colOf = React.useCallback((a: Appt) => dayKeys.indexOf(ymd(new Date(a.startAt))), [dayKeys]);

  // Optimistic positions: a dropped block stays at its new day/time until the server confirms
  // (props catch up → reconcile effect drops the override) or rejects it (we revert).
  const [overrides, setOverrides] = React.useState<Map<string, { startAt: string; endAt: string }>>(new Map());
  React.useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const a of appts) {
        const o = next.get(a.id);
        if (o && new Date(a.startAt).getTime() === new Date(o.startAt).getTime()) {
          next.delete(a.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [appts]);
  const effAppts = React.useMemo(
    () =>
      appts.map((a) => {
        const o = overrides.get(a.id);
        return o ? { ...a, startAt: o.startAt, endAt: o.endAt } : a;
      }),
    [appts, overrides],
  );

  // Lane layout computed per day column, then merged into one lookup.
  const layout = React.useMemo(() => {
    const buckets: Appt[][] = [[], [], [], [], [], [], []];
    for (const a of effAppts) {
      const i = dayKeys.indexOf(ymd(new Date(a.startAt)));
      if (i >= 0) buckets[i].push(a);
    }
    const merged = new Map<string, { col: number; cols: number }>();
    for (const b of buckets) for (const [id, p] of laneLayout(b)) merged.set(id, p);
    return merged;
  }, [effAppts, dayKeys]);

  const todayCol = dayKeys.indexOf(todayYmd);
  const nowTop = React.useMemo(() => {
    if (!now || todayCol < 0) return null;
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < GRID_START_MIN || min > END_HOUR * 60) return null;
    return (min - GRID_START_MIN) * PX_PER_MIN;
  }, [now, todayCol]);

  function startDrag(e: React.PointerEvent, appt: Appt) {
    if (appt.status === "CANCELLED" || appt.status === "COMPLETED" || appt.status === "NO_SHOW") {
      onSelect(appt);
      return;
    }
    e.preventDefault();
    const originCol = colOf(appt);
    dragData.current = { appt, startY: e.clientY, originCol, deltaMin: 0, col: originCol, moved: false };
    setDrag({ id: appt.id, deltaMin: 0, col: originCol, moved: false });

    const onMove = (ev: PointerEvent) => {
      const dd = dragData.current;
      if (!dd) return;
      const dy = ev.clientY - dd.startY;
      const deltaMin = Math.round(dy / PX_PER_MIN / snap) * snap;
      let col = dd.originCol;
      const rect = colsRef.current?.getBoundingClientRect();
      if (rect) col = Math.max(0, Math.min(6, Math.floor((ev.clientX - rect.left) / (rect.width / 7))));
      dd.deltaMin = deltaMin;
      dd.col = col;
      dd.moved = Math.abs(dy) > 4 || col !== dd.originCol;
      setDrag({ id: dd.appt.id, deltaMin, col, moved: dd.moved });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dd = dragData.current;
      dragData.current = null;
      setDrag(null);
      if (!dd) return;
      if (!dd.moved) onSelect(dd.appt);
      else void move(dd.appt, dd.deltaMin, dd.col);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function move(appt: Appt, deltaMin: number, col: number) {
    const day = weekDays[col];
    const mins = Math.max(0, minutesOf(appt.startAt) + deltaMin);
    const newStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    newStart.setMinutes(mins); // setMinutes carries overflow into hours
    const startAt = newStart.toISOString();
    const endAt = new Date(newStart.getTime() + (new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime())).toISOString();
    // Optimistic: pin the block to the dropped day/time immediately.
    setOverrides((m) => new Map(m).set(appt.id, { startAt, endAt }));
    const res = await fetch(`/api/v1/client/bookings/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt, reason: "Moved on calendar" }),
    });
    if (res.ok) {
      router.refresh(); // props catch up; the reconcile effect drops the override
    } else {
      setOverrides((m) => {
        const n = new Map(m);
        n.delete(appt.id); // revert — snap back
        return n;
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (data?.error === "slot_unavailable") window.alert("That time is already fully booked.");
    }
  }

  const colW = 100 / 7;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Day headers */}
          <div className="flex border-b border-stone-100">
            <div className="w-12 shrink-0" />
            {weekDays.map((d, i) => {
              const isToday = ymd(d) === todayYmd;
              return (
                <div key={i} className="flex-1 px-1 py-2 text-center">
                  <div className={cn("text-[11px] font-semibold uppercase", isToday ? "text-red-600" : "text-stone-400")}>{WD[d.getDay()]}</div>
                  <div
                    className={cn(
                      "mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold",
                      isToday ? "bg-red-500 text-white" : "text-stone-800",
                    )}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable time body */}
          <div className="max-h-[520px] overflow-y-auto">
            <div className="relative flex" style={{ height: HEIGHT }}>
              {/* Hour gutter */}
              <div className="relative w-12 shrink-0">
                {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
                  const hour = START_HOUR + i;
                  return (
                    <span key={hour} className="absolute right-1 text-[10px] text-stone-400" style={{ top: i * 60 * PX_PER_MIN - 6 }}>
                      {hour % 12 === 0 ? 12 : hour % 12}
                      {hour < 12 ? "am" : "pm"}
                    </span>
                  );
                })}
              </div>

              {/* Columns */}
              <div ref={colsRef} className="relative flex-1">
                {/* Hour lines */}
                {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
                  <div key={i} className="absolute left-0 right-0 border-t border-stone-100" style={{ top: i * 60 * PX_PER_MIN }} />
                ))}
                {/* Column separators */}
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-stone-100" style={{ left: `${i * colW}%` }} />
                ))}

                {/* Current-time marker (only when today is in view) */}
                {nowTop !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 -translate-y-1/2" style={{ top: nowTop }}>
                    <div className="h-0.5 w-full bg-red-500/70" />
                    {todayCol >= 0 && (
                      <span
                        className="absolute -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                        style={{ left: `calc(${todayCol * colW}% - 5px)` }}
                      />
                    )}
                  </div>
                )}

                {/* Appointment blocks */}
                {effAppts.map((a) => {
                  const isDragging = drag?.id === a.id;
                  const col = isDragging ? drag!.col : colOf(a);
                  if (col < 0) return null;
                  const extra = isDragging ? drag!.deltaMin : 0;
                  const startMin = minutesOf(a.startAt) + extra;
                  const top = Math.max(0, Math.min(HEIGHT - 6, (startMin - GRID_START_MIN) * PX_PER_MIN));
                  const height = Math.max(16, durationMin(a) * PX_PER_MIN - 2);
                  const { col: lane, cols } = layout.get(a.id) ?? { col: 0, cols: 1 };
                  const left = (col + lane / cols) * colW;
                  const width = colW / cols;
                  const draggedStart = new Date(new Date(a.startAt).getTime() + extra * 60_000);
                  return (
                    <div
                      key={a.id}
                      onPointerDown={(e) => startDrag(e, a)}
                      style={{ top, height, left: `${left}%`, width: `calc(${width}% - 2px)`, touchAction: "none" }}
                      className={cn(
                        "absolute cursor-grab overflow-hidden rounded-md border px-1 py-0.5 text-[10px] leading-tight shadow-sm active:cursor-grabbing",
                        BLOCK_STYLES[a.status] ?? "border-stone-300 bg-stone-100 text-stone-700",
                        isDragging && "z-30 shadow-lg ring-2 ring-amber-400",
                      )}
                    >
                      <p className="truncate font-semibold">
                        {draggedStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                      <p className="truncate opacity-80">{a.serviceName}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
