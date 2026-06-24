"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { planByName } from "@/lib/plans";
import { BillingCardStep } from "./BillingCardStep";

/**
 * Confirm-upgrade modal. Existing subscribers and test accounts apply instantly; not-yet-subscribed
 * real accounts collect a card via our own embedded Payment Element (no hosted Checkout redirect);
 * without Stripe configured the upgrade is captured as a request. Driven by parent `open`/`onClose`.
 */
export function UpgradeModal({
  open,
  onClose,
  toPlan,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  toPlan: string;
  reason?: string;
}) {
  const router = useRouter();
  const plan = planByName(toPlan);
  const [step, setStep] = React.useState<"confirm" | "pay">("confirm");
  const [result, setResult] = React.useState<"applied" | "requested" | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep("confirm");
      setResult(null);
    }
  }, [open]);

  if (!open) return null;
  const priceMo = plan ? `$${Math.round(plan.monthlyFee / 100)}/mo` : "";

  function onResolved(r: "applied" | "requested") {
    setResult(r);
    if (r === "applied") router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {result === "applied" ? (
          <div className="text-center">
            <h2 className="font-display text-xl text-stone-900">You&apos;re on {plan?.label} 🎉</h2>
            <p className="mt-2 text-sm text-stone-600">
              Your new features are unlocked. Turn on the ones you want, then request an update to add
              them to your live site.
            </p>
            <Button className="mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : result === "requested" ? (
          <div className="text-center">
            <h2 className="font-display text-xl text-stone-900">Request received</h2>
            <p className="mt-2 text-sm text-stone-600">
              Thanks! Our team will reach out to confirm your upgrade to {plan?.label} and get you set up.
            </p>
            <Button className="mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : step === "pay" ? (
          <>
            <h2 className="font-display text-xl text-stone-900">Upgrade to {plan?.label}</h2>
            <p className="mt-1 text-sm text-stone-600">Enter your card to switch to {priceMo}.</p>
            <div className="mt-4">
              <BillingCardStep flow="upgrade" toPlan={toPlan} reason={reason} onResolved={onResolved} />
            </div>
            <button onClick={onClose} className="mt-4 w-full text-center text-sm text-stone-500 hover:text-stone-700">
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl text-stone-900">Upgrade to {plan?.label}</h2>
            <p className="mt-1 text-sm text-stone-600">{plan?.tagline}</p>
            {plan && (
              <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
                {plan.highlights.slice(0, 4).map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500">✓</span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm font-medium text-stone-900">{priceMo}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep("pay")}>Continue to payment</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
