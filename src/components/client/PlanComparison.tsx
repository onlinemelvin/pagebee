"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PLANS, planByName, planRank, planLimitRows } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import { UpgradePaymentModal } from "./UpgradePaymentModal";

/**
 * Plan picker for the billing page. Switching tier (up or down) is FREE — it just rebuilds the preview
 * at that tier; you pay only at Approve & Launch.
 * - `mode="select"` (pre-launch): current reads "Selected plan"; others "Switch" → free preview.
 * - `mode="manage"` (post-launch): higher tiers "Switch" (free preview → pay the delta at approve);
 *   lower tiers "Downgrade" (a real billing change — scheduled to period end). `pendingPlan` shows a
 *   scheduled downgrade. The payment `UpgradeModal` only auto-opens via ?upgrade= (after approving a
 *   higher-tier preview, to collect the delta before it publishes).
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
  const searchParams = useSearchParams();
  const [switchToPlan, setSwitchToPlan] = React.useState<string | null>(null);
  const [upgradeTo, setUpgradeTo] = React.useState<string | null>(null);
  const [downgradeTo, setDowngradeTo] = React.useState<string | null>(null);
  const currentRank = planRank(currentPlan);

  // Approving a higher-tier preview routes here as ?upgrade=PLAN — pre-open the PAYMENT modal so they
  // can pay the delta and publish (this is the only place we collect money for a plan change).
  React.useEffect(() => {
    const want = searchParams.get("upgrade");
    if (want && planByName(want) && planRank(want) > currentRank) setUpgradeTo(want);
  }, [searchParams, currentRank]);

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

              <div className="mt-5 space-y-2">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    {mode === "select" ? "Selected plan" : "Your plan"}
                  </Button>
                ) : mode === "select" || isUpgrade ? (
                  // Switching tier is FREE — rebuilds the preview at that tier; payment is at launch.
                  <Button className="w-full" onClick={() => setSwitchToPlan(p.name)}>
                    {mode === "select" ? `Select ${p.label}` : `Switch to ${p.label}`}
                  </Button>
                ) : (
                  // Live + lower tier → a real billing change (scheduled to period end).
                  <Button variant="ghost" className="w-full text-stone-500" onClick={() => setDowngradeTo(p.name)}>Downgrade to {p.label}</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Free tier switch (up or down) — rebuilds the preview; payment is deferred to launch. */}
      <UpgradeModal open={switchToPlan !== null} onClose={() => setSwitchToPlan(null)} toPlan={switchToPlan ?? ""} />

      {/* Payment for a higher tier, only after approving its preview on a live site (?upgrade=PLAN). */}
      <UpgradePaymentModal open={upgradeTo !== null} onClose={() => setUpgradeTo(null)} toPlan={upgradeTo ?? ""} reason="approve_upgrade" />

      {downgradeTo && (
        <DowngradeModal planName={downgradeTo} onClose={() => setDowngradeTo(null)} onDone={() => { setDowngradeTo(null); router.refresh(); }} />
      )}
    </>
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
