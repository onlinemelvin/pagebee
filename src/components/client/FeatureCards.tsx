"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CreditCard,
  Globe,
  Image,
  ImagePlus,
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
import { toggleFeature } from "@/app/(client)/client/_actions/features";

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
export function FeatureCards({
  features,
  title = "Features",
  hideTitle = false,
  prepend,
}: {
  features: FeatureCardInfo[];
  title?: string;
  hideTitle?: boolean;
  /** An extra card rendered FIRST in the grid (e.g. the custom-domain card). */
  prepend?: React.ReactNode;
}) {
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

  // Reconcile against the authoritative DB value on mount. The RSC Router Cache can serve a stale
  // prefetched copy of this page after a feature was toggled elsewhere (e.g. the Media gallery
  // switch), so this `fetch` (no-store, bypasses that cache) corrects each card if needed.
  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/features", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.features) return;
        const fresh = new Map<string, FeatureCardInfo["state"]>(
          (data.features as FeatureCardInfo[]).map((f) => [f.key, f.state]),
        );
        setOptimistic((prev) => {
          const next = new Map(prev);
          for (const f of features) {
            const fs = fresh.get(f.key);
            if ((fs === "enabled" || fs === "available") && fs !== f.state) next.set(f.key, fs);
            else if (fs === f.state) next.delete(f.key);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(f: FeatureCardInfo, enabled: boolean) {
    if (!f.toggleKey) return;
    setOptimistic((m) => new Map(m).set(f.key, enabled ? "enabled" : "available")); // flip now
    try {
      // Server Action (not a fetch): its revalidatePath evicts the Media page's cached copy too,
      // so its gallery switch reflects this toggle without a hard reload.
      const res = await toggleFeature(f.toggleKey, enabled);
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
      {!hideTitle && <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>}
      <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", !hideTitle && "mt-3")}>
        {prepend}
        {features.map((f) => {
          const Icon = ICONS[f.key] ?? Sparkles;
          const state = optimistic.get(f.key) ?? f.state;
          const locked = state === "locked";
          const enabled = state === "enabled";
          return (
            <div
              key={f.key}
              className={cn(
                "lift group flex flex-col rounded-2xl border p-5 shadow-card transition-shadow",
                locked
                  ? "shimmer-sweep border-stone-200 bg-stone-50 hover:border-amber-300 hover:shadow-card-hover"
                  : "border-stone-200 bg-white hover:border-amber-300 hover:shadow-card-hover",
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
                <div className="flex items-center gap-2">
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
                  {/* On-plan features toggle right here; blocked (no page room) can't be enabled. */}
                  {!locked && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${enabled ? "Disable" : "Enable"} ${f.title}`}
                      title={!enabled && f.blockedReason ? f.blockedReason : undefined}
                      onClick={() => (enabled ? toggle(f, false) : onEnable(f))}
                      disabled={!enabled && Boolean(f.blockedReason)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
                        enabled ? "bg-amber-500" : "bg-stone-300",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                          enabled ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  )}
                </div>
              </div>

              <p className={cn("mt-3 font-medium", locked ? "text-stone-500" : "text-stone-900")}>{f.title}</p>
              <p className={cn("mt-1 flex-1 text-sm", locked ? "text-stone-400" : "text-stone-600")}>{f.desc}</p>

              {/* Gallery photos live in the Media library — point owners there to add/manage them. */}
              {f.key === "gallery" && !locked && (
                <Link
                  href="/client/media"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline"
                >
                  <ImagePlus size={13} /> Add photos in your Media page
                </Link>
              )}

              {/* Lead form submissions land in Inquiries — point owners there to read & reply. */}
              {f.key === "forms" && !locked && (
                <Link
                  href="/client/inquiries"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline"
                >
                  <Inbox size={13} /> View messages in your Inquiries page
                </Link>
              )}

              {((state === "available" && f.blockedReason) || (locked && f.toPlan)) && (
                <div className="mt-4">
                  {/* Available but no page room: explain why the toggle is disabled + offer the upgrade. */}
                  {state === "available" && f.blockedReason && (
                    <div>
                      <p className="mb-2 text-xs text-stone-500">{f.blockedReason}</p>
                      {f.toPlan && (
                        <button
                          onClick={() => setUpsell(f)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white",
                            "transition-all duration-200 hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_8px_24px_-6px_rgba(28,25,23,0.5)] active:translate-y-0",
                            "motion-reduce:transform-none",
                          )}
                        >
                          <Sparkles size={14} className="text-amber-400" /> Upgrade to {f.toPlanLabel}
                        </button>
                      )}
                    </div>
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
              )}
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
