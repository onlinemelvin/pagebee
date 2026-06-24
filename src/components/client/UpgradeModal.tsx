"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planByName } from "@/lib/plans";

/**
 * FREE plan-switch modal (the default everywhere a higher tier is offered: locked features, "out of
 * updates/edits" upsells, the plan grid). Switching is NOT a payment — it rebuilds the preview at the
 * chosen tier so the owner can see what it looks like on their site. They pay only at Approve &
 * Launch. To actually CHARGE for an upgrade (the post-approve delta), use UpgradePaymentModal.
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
  /** Accepted for call-site compatibility; not used by the free switch. */
  reason?: string;
}) {
  const router = useRouter();
  const plan = planByName(toPlan);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!open || !plan) return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      // No-regen switch: the site already exists at the top tier; this just reveals the higher tier.
      const res = await fetch("/api/v1/client/website/tier-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: toPlan }),
      });
      if (!res.ok) {
        setError("Couldn't switch — please try again.");
        setBusy(false);
        return;
      }
      router.push("/client/website"); // see it on the new tier
    } catch {
      setError("Couldn't switch — please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl text-stone-900">See your site on {plan.label}</h2>
        <p className="mt-1 text-sm text-stone-600">{plan.tagline}</p>

        <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
          {plan.highlights.slice(0, 4).map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-500">✓</span>
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
          <span className="text-stone-600">${Math.round(plan.setupFee / 100)} setup + ${Math.round(plan.monthlyFee / 100)}/mo</span>
          <span className="text-xs font-medium text-stone-400">billed at launch</span>
        </div>

        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          This is <strong>free</strong> — your site instantly shows the {plan.label} features (no rebuild). You only pay
          the setup fee + first month when you <strong>approve &amp; launch</strong>.
        </p>

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
            {busy ? "Switching…" : `See it on ${plan.label}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
