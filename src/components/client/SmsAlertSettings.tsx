"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Check, Lock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmsPrefs {
  enabled: boolean;
  phone: string | null;
  inquiries: boolean;
  appointments: boolean;
}

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40", on ? "bg-amber-500" : "bg-stone-300")}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

const GROUPS: { key: "inquiries" | "appointments"; title: string; desc: string }[] = [
  { key: "inquiries", title: "New inquiries", desc: "Text me the moment a lead comes in." },
  { key: "appointments", title: "Appointment requests", desc: "Text me when someone books." },
];

/** Owner SMS-alert settings: opt in, set the destination number, choose which alerts text you.
 *  Locked behind the `smsAlerts` plan feature — shows an upgrade prompt when off-plan. */
export function SmsAlertSettings({ initial, available, planLabel }: { initial: SmsPrefs; available: boolean; planLabel: string }) {
  const [prefs, setPrefs] = React.useState<SmsPrefs>(initial);
  const [phoneInput, setPhoneInput] = React.useState(initial.phone ?? "");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  }

  async function patch(next: Partial<SmsPrefs>) {
    const optimistic = { ...prefs, ...next };
    setPrefs(optimistic);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/notifications/sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { prefs: SmsPrefs };
      setPrefs(data.prefs);
      setPhoneInput(data.prefs.phone ?? "");
      flash();
    } catch {
      setPrefs(prefs); // revert
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleEnabled() {
    if (!prefs.enabled && !phoneInput.trim()) {
      setError("Add a mobile number first.");
      return;
    }
    // Persist the (possibly just-entered) number alongside the enable flip.
    patch({ enabled: !prefs.enabled, phone: phoneInput.trim() });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><MessageSquare size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-stone-900">Text (SMS) alerts</h2>
            {available ? (
              <Toggle on={prefs.enabled} disabled={busy} onClick={toggleEnabled} label="SMS alerts" />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500"><Lock size={11} /> {planLabel}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Get a text the second a new lead or booking comes in, with a link to reply in your dashboard.
          </p>
        </div>
      </div>

      {available ? (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Mobile number for alerts
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onBlur={() => phoneInput.trim() && phoneInput.trim() !== (prefs.phone ?? "") && patch({ phone: phoneInput.trim() })}
              placeholder="(555) 123-4567"
              className="max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            <span className="text-xs text-stone-400">US/Canada numbers. Standard message &amp; data rates apply. Reply STOP anytime to opt out.</span>
          </label>

          <div className={cn("mt-4 space-y-1 transition", !prefs.enabled && "pointer-events-none opacity-50")}>
            {GROUPS.map((g) => (
              <div key={g.key} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2.5 hover:bg-stone-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800">{g.title}</p>
                  <p className="text-xs text-stone-500">{g.desc}</p>
                </div>
                <Toggle on={prefs.enabled && prefs[g.key]} disabled={busy || !prefs.enabled} onClick={() => patch({ [g.key]: !prefs[g.key] })} label={g.title} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-xs">
            {error ? (
              <span className="text-rose-600">{error}</span>
            ) : saved ? (
              <><Check size={13} className="text-emerald-500" /> <span className="text-emerald-600">Saved</span></>
            ) : (
              <span className="text-stone-400">You can opt out anytime by replying STOP to any alert.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <Link href="/client/billing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800">
            <ArrowUpRight size={15} /> Upgrade to {planLabel} for text alerts
          </Link>
        </div>
      )}
    </div>
  );
}
