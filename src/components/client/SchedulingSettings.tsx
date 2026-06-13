"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SchedulingSettings, Weekday } from "@/lib/modules/booking";

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-700">
      {label}
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
      />
      {hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}
    </label>
  );
}

export function SchedulingSettings({ initial }: { initial: SchedulingSettings }) {
  const router = useRouter();
  const [s, setS] = React.useState<SchedulingSettings>(initial);
  const [newDate, setNewDate] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  function updateDay(key: Weekday, patch: Partial<SchedulingSettings["weekly"][Weekday]>) {
    setS((prev) => ({
      ...prev,
      weekly: { ...prev.weekly, [key]: { ...(prev.weekly[key] ?? { open: "09:00", close: "17:00", closed: false }), ...patch } },
    }));
  }

  async function save() {
    setPhase("saving");
    try {
      const res = await fetch("/api/v1/client/scheduling", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error();
      setPhase("saved");
      router.refresh();
      setTimeout(() => setPhase("idle"), 2000);
    } catch {
      setPhase("error");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Weekly hours + recurring off-days */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Weekly hours</h2>
        <p className="mt-1 text-sm text-stone-500">Uncheck a day to make it a recurring day off (e.g. weekends).</p>
        <div className="mt-4 space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = s.weekly[key] ?? { open: "09:00", close: "17:00", closed: false };
            return (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm font-medium text-stone-700">
                  <input
                    type="checkbox"
                    checked={!day.closed}
                    onChange={(e) => updateDay(key, { closed: !e.target.checked })}
                    className="h-4 w-4 rounded border-stone-300 accent-amber-500"
                  />
                  {label}
                </label>
                {day.closed ? (
                  <span className="text-sm text-stone-400">Closed</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                      className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
                    />
                    <span className="text-stone-400">–</span>
                    <input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                      className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Capacity & rules */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Booking rules</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Concurrent appointments" min={1} value={s.concurrent} onChange={(n) => setS({ ...s, concurrent: Math.max(1, n) })} hint="How many you can take at once (default 1)." />
          <NumberField label="Slot length (min)" min={5} value={s.slotMinutes} onChange={(n) => setS({ ...s, slotMinutes: n })} hint="Default appointment length." />
          <NumberField label="Buffer between (min)" value={s.bufferMinutes} onChange={(n) => setS({ ...s, bufferMinutes: n })} hint="Gap added after each appointment." />
          <NumberField label="Minimum notice (hrs)" value={s.minNoticeHours} onChange={(n) => setS({ ...s, minNoticeHours: n })} hint="Can't be booked within this window." />
          <NumberField label="Booking window (days)" min={1} value={s.maxAdvanceDays} onChange={(n) => setS({ ...s, maxAdvanceDays: n })} hint="How far ahead customers can book." />
          <NumberField label="Daily cap" value={s.dailyCap} onChange={(n) => setS({ ...s, dailyCap: n })} hint="Max per day (0 = unlimited)." />
        </div>
      </section>

      {/* Services moved to the central catalog */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Services</h2>
        <p className="mt-1 text-sm text-stone-500">
          Services and their typical durations now live in your central{" "}
          <Link href="/client/services" className="font-medium text-amber-700 hover:underline">
            Services catalog
          </Link>
          . The booking picker auto-sizes each slot to the chosen service.
        </p>
      </section>

      {/* Blocked dates (specific off-days) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Days off</h2>
        <p className="mt-1 text-sm text-stone-500">Block specific dates (holidays, vacation).</p>
        {s.blockedDates.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[...s.blockedDates].sort().map((d) => (
              <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
                {new Date(`${d}T00:00:00`).toLocaleDateString()}
                <button
                  onClick={() => setS({ ...s, blockedDates: s.blockedDates.filter((x) => x !== d) })}
                  className="text-stone-400 hover:text-red-600"
                  aria-label="Unblock date"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-end gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            disabled={!newDate || s.blockedDates.includes(newDate)}
            onClick={() => {
              setS({ ...s, blockedDates: [...s.blockedDates, newDate] });
              setNewDate("");
            }}
          >
            Block date
          </Button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button size="lg" disabled={phase === "saving"} onClick={save}>
          {phase === "saving" ? "Saving…" : "Save availability"}
        </Button>
        {phase === "saved" && <span className="text-sm font-medium text-green-700">Saved ✓</span>}
        {phase === "error" && <span className="text-sm text-red-600">Couldn&apos;t save — try again.</span>}
      </div>
    </div>
  );
}
