"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { planByName } from "@/lib/plans";
import { BillingCardStep } from "./BillingCardStep";

/**
 * PAYMENT modal for an upgrade — collects the (non-refundable) setup-fee difference + prorated monthly
 * via our embedded Payment Element. This is the ONLY place a plan change is charged, and it's reached
 * at the approve/launch stage (e.g. after approving a higher-tier preview on a live site, routed here
 * via /client/billing?upgrade=PLAN). Existing subscribers upgrade in place; test / no-Stripe accounts
 * apply or capture a request. For free tier *switching* (no charge) use UpgradeModal instead.
 */
export function UpgradePaymentModal({
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
  const [result, setResult] = React.useState<"applied" | "requested" | null>(null);

  React.useEffect(() => {
    if (open) setResult(null);
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
            <p className="mt-2 text-sm text-stone-600">Your upgrade is paid and your new features are unlocked.</p>
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
        ) : (
          <>
            <h2 className="font-display text-xl text-stone-900">Upgrade to {plan?.label}</h2>
            <p className="mt-1 text-sm text-stone-600">Pay to publish your {plan?.label} site.</p>
            <p className="mt-3 text-sm font-medium text-stone-900">{priceMo} · plus the non-refundable setup-fee difference</p>
            <div className="mt-4">
              <BillingCardStep flow="upgrade" toPlan={toPlan} reason={reason} onResolved={onResolved} />
            </div>
            <button onClick={onClose} className="mt-3 w-full text-center text-sm text-stone-500 hover:text-stone-700">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
