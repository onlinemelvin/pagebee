"use client";

import * as React from "react";
import { Mail, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_LABELS, NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/modules/notification/meta";

interface Prefs {
  enabled: boolean;
  inquiries: boolean;
  appointments: boolean;
  billing: boolean;
  website: boolean;
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
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40",
        on ? "bg-amber-500" : "bg-stone-300",
      )}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

export function NotificationSettings({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = React.useState<Prefs>(initial);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(next: Partial<Prefs>) {
    const optimistic = { ...prefs, ...next };
    setPrefs(optimistic);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/client/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { prefs: Prefs };
      setPrefs(data.prefs);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
    } catch {
      setPrefs(prefs); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <Mail size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-stone-900">Email notifications</h2>
            <Toggle on={prefs.enabled} disabled={busy} onClick={() => patch({ enabled: !prefs.enabled })} label="All email notifications" />
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Get an email when something needs you. In-app notifications (the bell) always stay on — these settings only control email.
          </p>
        </div>
      </div>

      <div className={cn("mt-5 space-y-1 border-t border-stone-100 pt-4 transition", !prefs.enabled && "pointer-events-none opacity-50")}>
        {NOTIFICATION_GROUPS.map((g: NotificationGroup) => (
          <div key={g} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2.5 hover:bg-stone-50">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">{GROUP_LABELS[g].title}</p>
              <p className="text-xs text-stone-500">{GROUP_LABELS[g].desc}</p>
            </div>
            <Toggle on={prefs.enabled && prefs[g]} disabled={busy || !prefs.enabled} onClick={() => patch({ [g]: !prefs[g] })} label={GROUP_LABELS[g].title} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-xs text-stone-400">
        {saved ? (
          <>
            <Check size={13} className="text-emerald-500" /> <span className="text-emerald-600">Saved</span>
          </>
        ) : (
          <span>
            Critical emails about security and failed payments are always sent.
          </span>
        )}
      </div>
    </div>
  );
}
