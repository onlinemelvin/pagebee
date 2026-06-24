"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, planByName, planRank, planLimitRows } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import { BillingCardStep } from "./BillingCardStep";

/**
 * Plan picker for the billing page.
 * - `mode="select"` (pre-launch): the current plan reads "Selected plan"; others offer "Select" →
 *   pays the setup fee + first month for the chosen tier and launches.
 * - `mode="manage"` (post-launch): higher tiers offer "Upgrade", lower tiers "Downgrade" (effective
 *   at period end). `pendingPlan` shows a scheduled downgrade.
 */
export function PlanComparison({
  currentPlan,
  mode = "manage",
  pendingPlan,
}: {
  currentPlan: string;
  mode?: "select" | "manage";
  pendingPlan?: string | null;
}) {
  const router = useRouter();
  const [upgradeTo, setUpgradeTo] = React.useState<string | null>(null);
  const [selectTo, setSelectTo] = React.useState<string | null>(null);
  const [downgradeTo, setDowngradeTo] = React.useState<string | null>(null);
  const currentRank = planRank(currentPlan);

  return (
    <>
      {pendingPlan && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Scheduled to switch to <span className="font-semibold">{planByName(pendingPlan)?.label ?? pendingPlan}</span> at the end of your billing period.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const rank = planRank(p.name);
          const isCurrent = rank === currentRank;
          const isUpgrade = rank > currentRank;
          return (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-white p-5 shadow-card",
                isCurrent ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200",
              )}
            >
              {p.recommended && !isCurrent && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Popular</span>
              )}
              {isCurrent && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-950">
                  {mode === "select" ? "Selected" : "Current plan"}
                </span>
              )}
              <p className="font-display text-xl text-stone-900">{p.label}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{p.cardSubtitle}</p>
              <p className="mt-0.5 text-sm text-stone-500">{p.tagline}</p>
              <p className="mt-3">
                <span className="font-display text-3xl text-stone-900">${Math.round(p.monthlyFee / 100)}</span>
                <span className="text-sm text-stone-400">/mo</span>
              </p>
              <p className="text-xs text-stone-400">+ ${Math.round(p.setupFee / 100)} one-time setup</p>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {planLimitRows(p).map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">{r.label}</span>
                    <span className="font-semibold text-stone-800">{r.value}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    {mode === "select" ? "Selected plan" : "Your plan"}
                  </Button>
                ) : mode === "select" ? (
                  <Button className="w-full" onClick={() => setSelectTo(p.name)}>Select {p.label}</Button>
                ) : isUpgrade ? (
                  <Button className="w-full" onClick={() => setUpgradeTo(p.name)}>Upgrade to {p.label}</Button>
                ) : (
                  <Button variant="ghost" className="w-full text-stone-500" onClick={() => setDowngradeTo(p.name)}>Downgrade to {p.label}</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <UpgradeModal open={upgradeTo !== null} onClose={() => setUpgradeTo(null)} toPlan={upgradeTo ?? ""} reason="billing page" />

      {selectTo && (
        <SelectPlanModal planName={selectTo} onClose={() => setSelectTo(null)} onDone={() => { setSelectTo(null); router.refresh(); }} />
      )}

      {downgradeTo && (
        <DowngradeModal planName={downgradeTo} onClose={() => setDowngradeTo(null)} onDone={() => { setDowngradeTo(null); router.refresh(); }} />
      )}
    </>
  );
}

/** Pre-launch plan selection → pays setup + first month for the chosen tier and launches. */
function SelectPlanModal({ planName, onClose, onDone }: { planName: string; onClose: () => void; onDone: () => void }) {
  const plan = planByName(planName);
  const [done, setDone] = React.useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl text-stone-900">{done ? "Payment received" : `Get started on ${plan?.label}`}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close"><X size={18} /></button>
        </div>
        {done ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
            <p className="mt-3 text-sm text-stone-600">We&apos;re launching your site now.</p>
          </div>
        ) : (
          <>
            {plan && (
              <p className="mt-1 text-sm text-stone-600">
                ${Math.round(plan.setupFee / 100)} one-time setup + ${Math.round(plan.monthlyFee / 100)}/mo. The setup fee is non-refundable.
              </p>
            )}
            <div className="mt-4">
              <BillingCardStep flow="setup" toPlan={planName} onResolved={(r) => { if (r === "applied") setDone(true); setTimeout(onDone, 1300); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Confirm a downgrade (effective at period end, no refund). */
function DowngradeModal({ planName, onClose, onDone }: { planName: string; onClose: () => void; onDone: () => void }) {
  const plan = planByName(planName);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [effectiveAt, setEffectiveAt] = React.useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/billing/downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toPlan: planName }),
      });
      const data = (await res.json().catch(() => null)) as { effectiveAt?: string | null; error?: string } | null;
      if (!res.ok) {
        setError(data?.error === "not_a_downgrade" ? "That isn't a downgrade." : "Couldn't schedule the downgrade — please try again.");
        setBusy(false);
        return;
      }
      setEffectiveAt(data?.effectiveAt ?? null);
    } catch {
      setError("Couldn't schedule the downgrade — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {effectiveAt !== null ? (
          <div className="text-center">
            <h2 className="font-display text-xl text-stone-900">Downgrade scheduled</h2>
            <p className="mt-2 text-sm text-stone-600">
              You&apos;ll move to {plan?.label}{effectiveAt ? ` on ${effectiveAt}` : " at the end of your billing period"}. You keep your
              current features until then.
            </p>
            <Button className="mt-5" onClick={onDone}>Done</Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl text-stone-900">Downgrade to {plan?.label}?</h2>
            <p className="mt-2 text-sm text-stone-600">
              This takes effect at the end of your current billing period — you keep your current features until then. No
              refund or credit is issued, and any active loyalty discount is forfeited.
            </p>
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Keep current plan</Button>
              <Button onClick={confirm} disabled={busy}>{busy ? "Scheduling…" : `Downgrade to ${plan?.label}`}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
