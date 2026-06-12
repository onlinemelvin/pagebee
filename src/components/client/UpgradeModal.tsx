"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { planByName } from "@/lib/plans";

/**
 * Confirm-upgrade modal. Posts to /api/v1/client/subscription/upgrade — test accounts apply
 * instantly (then we refresh so the new plan's features unlock); real accounts get a captured
 * request the team will action. Driven by parent `open`/`onClose`.
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
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<"applied" | "requested" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;
  const priceMo = plan ? `$${Math.round(plan.monthlyFee / 100)}/mo` : "";

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toPlan, reason }),
      });
      const data = (await res.json().catch(() => null)) as { applied?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setResult(data?.applied ? "applied" : "requested");
      if (data?.applied) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => !busy && onClose()}
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
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={confirm}>
                {busy ? "Upgrading…" : `Upgrade to ${plan?.label}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
