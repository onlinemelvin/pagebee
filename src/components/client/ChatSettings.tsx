"use client";

import * as React from "react";
import { Settings, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatConfig } from "@/lib/modules/chat";

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Show chat on my website"
      disabled={disabled}
      onClick={onClick}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40", on ? "bg-amber-500" : "bg-stone-300")}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

/** Owner-only website-chat settings: on/off, greeting, and how long to wait before the AI hands a
 *  stalled chat off to a lead. Collapsible so it stays out of the way of the inbox. */
export function ChatSettings({ initial }: { initial: ChatConfig }) {
  const [open, setOpen] = React.useState(false);
  const [cfg, setCfg] = React.useState<ChatConfig>(initial);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(next: Partial<ChatConfig>) {
    const optimistic = { ...cfg, ...next };
    setCfg(optimistic);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/client/chats/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { config: ChatConfig };
      setCfg(data.config);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
    } catch {
      setCfg(cfg); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><Settings size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-stone-900">Website chat assistant</p>
          <p className="text-sm text-stone-500">{cfg.enabled ? "Live on your website — visitors can chat with your AI assistant." : "Off — visitors won't see the chat widget."}</p>
        </div>
        <Toggle on={cfg.enabled} disabled={busy} onClick={() => patch({ enabled: !cfg.enabled })} />
        <button onClick={() => setOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100" aria-label="More settings">
          <ChevronDown size={18} className={cn("transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-stone-100 px-5 py-4">
          <label className="block text-sm">
            <span className="font-medium text-stone-700">Greeting</span>
            <textarea
              value={cfg.greeting}
              onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })}
              onBlur={() => cfg.greeting !== initial.greeting && patch({ greeting: cfg.greeting })}
              rows={2}
              maxLength={280}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            <span className="text-xs text-stone-400">The first message visitors see when they open the chat.</span>
          </label>

          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block font-medium text-stone-700">Hand off to me after</span>
              <span className="text-xs text-stone-400">How long the AI waits for you before taking the visitor&apos;s contact and creating a lead.</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={cfg.escalationTimeoutMinutes}
                onChange={(e) => setCfg({ ...cfg, escalationTimeoutMinutes: Number(e.target.value) })}
                onBlur={() => patch({ escalationTimeoutMinutes: cfg.escalationTimeoutMinutes })}
                className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
              <span className="text-stone-500">min</span>
            </span>
          </label>

          {saved && <p className="flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> Saved</p>}
        </div>
      )}
    </div>
  );
}
