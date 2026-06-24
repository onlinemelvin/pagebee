"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planByName } from "@/lib/plans";
import { BillingCardStep } from "./BillingCardStep";

/**
 * Unified plan-switch modal used everywhere a higher tier is offered (locked features, the plan grid,
 * upsells). Confirming calls /website/tier-view, and the SERVER decides:
 *  • pre-launch (or test) → the tier is switched in the BACKGROUND for free (the dashboard unlocks,
 *    the website preview updates); the owner stays on the page. Payment happens at Approve & Launch.
 *  • live + paid → upgrades collect the setup-fee delta + prorated monthly here (BillingCardStep);
 *    downgrades route to billing (scheduled, no charge).
 * Driven by parent `open`/`onClose`.
 */
export function UpgradeModal({
  open,
  onClose,
  toPlan,
}: {
  open: boolean;
  onClose: () => void;
  toPlan: string;
  /** Accepted for call-site compatibility; not used. */
  reason?: string;
}) {
  const router = useRouter();
  const plan = planByName(toPlan);
  const [step, setStep] = React.useState<"confirm" | "pay">("confirm");
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (open) {
      setStep("confirm");
      setDone(false);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!open || !plan || !mounted) return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/tier-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: toPlan }),
      });
      const data = (await res.json().catch(() => null)) as { mode?: string; direction?: string } | null;
      if (!res.ok || !data) {
        setError("Couldn't switch — please try again.");
        setBusy(false);
        return;
      }
      if (data.mode === "payment") {
        if (data.direction === "downgrade") {
          router.push("/client/billing");
          return;
        }
        setStep("pay"); // live upgrade → collect the delta
        setBusy(false);
        return;
      }
      // Pre-launch background switch applied server-side. Show the success state and KEEP the modal
      // open until the owner clicks Okay — the page refresh happens then (refreshing now would unmount
      // this modal on a locked-feature gate, since the gate page itself is replaced).
      setDone(true);
      setBusy(false);
    } catch {
      setError("Couldn't switch — please try again.");
      setBusy(false);
    }
  }

  function onPaid(r: "applied" | "requested") {
    if (r === "applied") setDone(true);
  }

  // Dismissing the success state is when the page behind refreshes to reflect the new tier.
  function finishAndClose() {
    router.refresh();
    onClose();
  }

  // Portal to <body> so the full-screen overlay escapes any transformed/blurred ancestor (e.g. the
  // UpgradeGate card's backdrop-blur), which would otherwise confine `fixed inset-0` to that box.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => !busy && (done ? finishAndClose() : onClose())}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <p className="mt-3 font-display text-xl text-stone-900">You&apos;re on {plan.label}</p>
            <p className="mt-1 text-sm text-stone-600">Your {plan.label} features are unlocked. You only pay when you approve &amp; launch.</p>
            <Button className="mt-5" onClick={finishAndClose}>Okay</Button>
          </div>
        ) : step === "pay" ? (
          <>
            <h2 className="font-display text-xl text-stone-900">Upgrade to {plan.label}</h2>
            <p className="mt-1 text-sm text-stone-600">Pay the setup-fee difference + prorated month to switch your live plan.</p>
            <div className="mt-4">
              <BillingCardStep flow="upgrade" toPlan={toPlan} onResolved={onPaid} />
            </div>
            <button onClick={onClose} className="mt-3 w-full text-center text-sm text-stone-500 hover:text-stone-700">Cancel</button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl text-stone-900">Switch to {plan.label}</h2>
            <p className="mt-1 text-sm text-stone-600">{plan.tagline}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
              {plan.highlights.slice(0, 4).map((h, i) => (
                <li key={i} className="flex gap-2"><span className="text-amber-500">✓</span>{h}</li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
              <span className="text-stone-600">${Math.round(plan.setupFee / 100)} setup + ${Math.round(plan.monthlyFee / 100)}/mo</span>
              <span className="text-xs font-medium text-stone-400">billed at launch</span>
            </div>
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              This is <strong>free</strong> — your {plan.label} features unlock now and your site updates instantly. You
              only pay the setup fee + first month when you <strong>approve &amp; launch</strong>.
            </p>
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? "Switching…" : `Switch to ${plan.label}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
