"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date input + bookable time slots for that day (from the owner availability endpoint). */
export function SlotPicker({
  service,
  value,
  onChange,
  defaultDate,
}: {
  service?: string;
  value: string | null;
  onChange: (iso: string) => void;
  defaultDate?: string;
}) {
  const [date, setDate] = React.useState(defaultDate || todayYmd());
  const [slots, setSlots] = React.useState<{ startAt: string; label: string }[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({ date });
    if (service) q.set("service", service);
    fetch(`/api/v1/client/bookings/availability?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setSlots((d?.days?.[0]?.slots as { startAt: string; label: string }[]) ?? []);
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date, service]);

  return (
    <div className="grid gap-2">
      <input
        type="date"
        value={date}
        min={todayYmd()}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-stone-400">Loading available times…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-stone-400">No open slots that day — try another date or adjust availability.</p>
      ) : (
        <div className="grid max-h-44 grid-cols-3 gap-2 overflow-y-auto">
          {slots.map((s) => (
            <button
              key={s.startAt}
              type="button"
              onClick={() => onChange(s.startAt)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-sm transition-colors",
                value === s.startAt
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-stone-300 text-stone-700 hover:border-amber-400 hover:bg-amber-50",
              )}
            >
              {new Date(s.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
