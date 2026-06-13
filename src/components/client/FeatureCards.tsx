"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CreditCard,
  Globe,
  Image,
  Inbox,
  Lock,
  MessageSquare,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import type { FeatureCardInfo } from "@/lib/modules/client";

const ICONS: Record<string, LucideIcon> = {
  gallery: Image,
  forms: Inbox,
  booking: CalendarCheck,
  chat: MessageSquare,
  sms: Smartphone,
  payments: CreditCard,
  ai: Sparkles,
  domain: Globe,
};

/**
 * Reusable plan-aware feature grid. Each card is enabled (on — toggle off), available (on the
 * plan but off — enable, with a responsibility disclaimer for risky features), or locked (a higher
 * tier — upgrade). Tasteful, transforms-only, reduced-motion-safe motion (UI/UX Pro guidance).
 */
export function FeatureCards({ features, title = "Features" }: { features: FeatureCardInfo[]; title?: string }) {
  const router = useRouter();
  const [upsell, setUpsell] = React.useState<FeatureCardInfo | null>(null);
  const [confirm, setConfirm] = React.useState<FeatureCardInfo | null>(null);

  // Optimistic toggle state: a card flips instantly (rendered from here) while the backend catches
  // up. The reconcile effect drops the override once props match; a failed call reverts it.
  const [optimistic, setOptimistic] = React.useState<Map<string, "enabled" | "available">>(new Map());
  React.useEffect(() => {
    setOptimistic((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const f of features) {
        if (next.get(f.key) === f.state) {
          next.delete(f.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [features]);

  async function toggle(f: FeatureCardInfo, enabled: boolean) {
    if (!f.toggleKey) return;
    setOptimistic((m) => new Map(m).set(f.key, enabled ? "enabled" : "available")); // flip now
    try {
      const res = await fetch("/api/v1/client/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: f.toggleKey, enabled }),
      });
      if (res.ok) {
        router.refresh(); // props catch up; reconcile effect drops the override
      } else {
        setOptimistic((m) => {
          const n = new Map(m);
          n.delete(f.key); // revert
          return n;
        });
      }
    } catch {
      setOptimistic((m) => {
        const n = new Map(m);
        n.delete(f.key);
        return n;
      });
    }
  }

  function onEnable(f: FeatureCardInfo) {
    if (f.disclaimer) setConfirm(f); // risky feature → warn first
    else void toggle(f, true);
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon = ICONS[f.key] ?? Sparkles;
          const state = optimistic.get(f.key) ?? f.state;
          const locked = state === "locked";
          const enabled = state === "enabled";
          return (
            <div
              key={f.key}
              className={cn(
                "lift group flex flex-col rounded-2xl border p-5",
                locked
                  ? "shimmer-sweep border-stone-200 bg-stone-50 hover:border-amber-300 hover:shadow-lg"
                  : "border-stone-200 bg-white hover:border-amber-300 hover:shadow-lg",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none",
                    locked ? "bg-stone-200 text-stone-500" : "bg-amber-100 text-amber-700",
                  )}
                >
                  <Icon size={20} />
                </span>
                {enabled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                    <Check size={11} /> Enabled
                  </span>
                )}
                {state === "available" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Available
                  </span>
                )}
                {locked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    <Lock size={11} /> {f.toPlanLabel}
                  </span>
                )}
              </div>

              <p className={cn("mt-3 font-medium", locked ? "text-stone-500" : "text-stone-900")}>{f.title}</p>
              <p className={cn("mt-1 flex-1 text-sm", locked ? "text-stone-400" : "text-stone-600")}>{f.desc}</p>

              <div className="mt-4">
                {enabled && (
                  <button
                    onClick={() => toggle(f, false)}
                    className="text-xs font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
                  >
                    Disable
                  </button>
                )}

                {state === "available" && (
                  <button
                    onClick={() => onEnable(f)}
                    className={cn(
                      "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-white",
                      "shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.6)] active:translate-y-0",
                      "motion-reduce:transform-none",
                    )}
                  >
                    Enable
                  </button>
                )}

                {locked && f.toPlan && (
                  <button
                    onClick={() => setUpsell(f)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_8px_24px_-6px_rgba(28,25,23,0.5)] active:translate-y-0",
                      "motion-reduce:transform-none",
                    )}
                  >
                    <Sparkles size={14} className="text-amber-400" /> Upgrade to unlock
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Responsibility disclaimer before enabling a risky feature */}
      {confirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setConfirm(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg text-stone-900">Enable {confirm.title}?</h2>
                <p className="mt-1.5 text-sm text-stone-600">{confirm.disclaimer}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const f = confirm;
                  setConfirm(null);
                  void toggle(f, true);
                }}
              >
                I understand — enable
              </Button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        open={upsell !== null}
        onClose={() => setUpsell(null)}
        toPlan={upsell?.toPlan ?? ""}
        reason="feature"
      />
    </section>
  );
}
