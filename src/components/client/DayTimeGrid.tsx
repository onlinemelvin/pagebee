"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Appt } from "./appointments-types";

const START_HOUR = 7;
const END_HOUR = 21;
const PX_PER_MIN = 0.9; // 54px / hour
const GRID_START_MIN = START_HOUR * 60;
const GRID_MIN = (END_HOUR - START_HOUR) * 60;
const HEIGHT = GRID_MIN * PX_PER_MIN;

const BLOCK_STYLES: Record<string, string> = {
  REQUESTED: "border-dashed border-amber-400 bg-amber-50/80 text-amber-900", // pending → dotted/faded
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

/** A single day rendered as a vertical time grid; drag a block to reschedule, click to open it. */
export function DayTimeGrid({
  appts,
  snapMinutes,
  dateYmd,
  onSelect,
}: {
  appts: Appt[];
  snapMinutes: number;
  dateYmd: string;
  onSelect: (a: Appt) => void;
}) {
  const router = useRouter();
  const snap = Math.max(5, snapMinutes || 30);

  // Live "current time" marker — only when the viewed day is today; ticks every minute.
  // Initialized after mount (null on first render) to avoid an SSR hydration mismatch.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowTop = React.useMemo(() => {
    if (!now) return null;
    const k = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (k !== dateYmd) return null;
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < GRID_START_MIN || min > END_HOUR * 60) return null;
    return (min - GRID_START_MIN) * PX_PER_MIN;
  }, [now, dateYmd]);
  const [drag, setDrag] = React.useState<{ id: string; deltaMin: number; moved: boolean } | null>(null);
  const dragData = React.useRef<{ appt: Appt; startY: number; deltaMin: number; moved: boolean } | null>(null);

  // Optimistic positions: a dropped block stays where it landed (rendered from here) until the
  // server confirms — props catch up and the reconcile effect drops the override — or rejects it
  // (we revert). Avoids the snap-back-then-jump while the PATCH is in flight.
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

  // Lane layout: overlapping appointments sit side-by-side (each gets a column within its cluster).
  const layout = React.useMemo(() => {
    const sorted = [...effAppts].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const pos = new Map<string, { col: number; cols: number }>();
    let cluster: string[] = [];
    let lanes: number[] = []; // each lane's current end (minutes)
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
      if (cluster.length && s >= clusterEnd) flush(); // no overlap with current cluster → finalize it
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
  }, [effAppts]);

  function startDrag(e: React.PointerEvent, appt: Appt) {
    if (appt.status === "CANCELLED" || appt.status === "COMPLETED" || appt.status === "NO_SHOW") {
      onSelect(appt); // terminal — no drag, just open
      return;
    }
    e.preventDefault();
    dragData.current = { appt, startY: e.clientY, deltaMin: 0, moved: false };
    setDrag({ id: appt.id, deltaMin: 0, moved: false });

    const onMove = (ev: PointerEvent) => {
      const dd = dragData.current;
      if (!dd) return;
      const dy = ev.clientY - dd.startY;
      const deltaMin = Math.round(dy / PX_PER_MIN / snap) * snap;
      dd.deltaMin = deltaMin;
      dd.moved = Math.abs(dy) > 4;
      setDrag({ id: dd.appt.id, deltaMin, moved: dd.moved });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dd = dragData.current;
      dragData.current = null;
      setDrag(null);
      if (!dd) return;
      if (!dd.moved) onSelect(dd.appt);
      else if (dd.deltaMin !== 0) void reschedule(dd.appt, dd.deltaMin);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function reschedule(appt: Appt, deltaMin: number) {
    const start = new Date(new Date(appt.startAt).getTime() + deltaMin * 60_000);
    const startAt = start.toISOString();
    const endAt = new Date(start.getTime() + (new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime())).toISOString();
    // Optimistic: pin the block to where it was dropped right away.
    setOverrides((m) => new Map(m).set(appt.id, { startAt, endAt }));
    const res = await fetch(`/api/v1/client/bookings/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt, reason: "Moved on calendar" }),
    });
    if (res.ok) {
      router.refresh(); // server data catches up; the reconcile effect then drops the override
    } else {
      setOverrides((m) => {
        const n = new Map(m);
        n.delete(appt.id); // revert — snap back to the original spot
        return n;
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (data?.error === "slot_unavailable") window.alert("That time is already fully booked.");
    }
  }

  return (
    <div className="overflow-y-auto rounded-2xl border border-stone-200 bg-white" style={{ maxHeight: 520 }}>
      <div className="relative" style={{ height: HEIGHT }}>
        {/* Hour lines + labels */}
        {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
          const hour = START_HOUR + i;
          return (
            <div key={hour} className="absolute left-0 right-0 border-t border-stone-100" style={{ top: i * 60 * PX_PER_MIN }}>
              <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-stone-400">
                {hour % 12 === 0 ? 12 : hour % 12}
                {hour < 12 ? "am" : "pm"}
              </span>
            </div>
          );
        })}

        {/* Current-time marker (today only) */}
        {nowTop !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
            style={{ top: nowTop }}
          >
            <span className="ml-11 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-white" />
            <div className="mr-2 h-0.5 flex-1 bg-red-500" />
          </div>
        )}

        {/* Appointment blocks */}
        <div className="absolute inset-y-0 left-12 right-2">
          {effAppts.map((a) => {
            const startMin = minutesOf(a.startAt);
            const dur = durationMin(a);
            const isDragging = drag?.id === a.id;
            const extra = isDragging ? drag!.deltaMin : 0;
            const top = Math.max(0, Math.min(HEIGHT - 8, (startMin - GRID_START_MIN + extra) * PX_PER_MIN));
            const height = Math.max(22, dur * PX_PER_MIN - 2);
            const draggedStart = new Date(new Date(a.startAt).getTime() + extra * 60_000);
            const { col, cols } = layout.get(a.id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / cols;
            return (
              <div
                key={a.id}
                onPointerDown={(e) => startDrag(e, a)}
                style={{
                  top,
                  height,
                  left: `${col * widthPct}%`,
                  width: `calc(${widthPct}% - 3px)`,
                  touchAction: "none",
                }}
                className={cn(
                  "absolute cursor-grab overflow-hidden rounded-lg border-2 px-2 py-1 text-xs shadow-sm transition-shadow active:cursor-grabbing",
                  BLOCK_STYLES[a.status] ?? "border-stone-300 bg-stone-100 text-stone-700",
                  isDragging && "z-10 shadow-lg ring-2 ring-amber-400",
                )}
              >
                <p className="font-semibold">
                  {draggedStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {a.serviceName}
                </p>
                <p className="truncate opacity-80">{a.customerName ?? "—"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
