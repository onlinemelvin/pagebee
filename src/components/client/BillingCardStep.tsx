"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { StripePaymentElement } from "@/components/payments/StripePaymentElement";
import { formatUsd } from "@/lib/utils";

type Intent =
  | { kind: "applied" }
  | { kind: "requested" }
  | { kind: "card"; clientSecret: string; amountCents: number; planLabel: string; flow: "setup" | "upgrade" };

const ERR: Record<string, string> = {
  stripe_not_configured: "Card billing isn't set up yet — please check back soon.",
  no_subscription: "We couldn't find your plan. Contact support.",
  not_an_upgrade: "You're already on this plan or higher.",
  invalid_plan: "That plan isn't available.",
  intent_failed: "Couldn't start the payment. Please try again.",
};

/**
 * Embedded, white-label card step shared by the setup CTA, plan selection, and the upgrade modal.
 *
 * Step 1 is a required acceptance of the non-refundable billing terms — gated BEFORE any charge,
 * because an in-place upgrade (existing card) bills the moment the intent is created. On accept we
 * fetch the billing intent: if it resolves instantly (in-place upgrade / test account) or as an
 * admin request it calls `onResolved` with no card shown; otherwise it mounts our own Payment
 * Element (Stripe iframes — card data never touches our DOM, PCI SAQ A) and reconciles on success.
 *
 * NOTE: the terms copy below is a PLACEHOLDER — replace with lawyer-reviewed text.
 */
export function BillingCardStep({
  flow,
  toPlan,
  reason,
  onResolved,
}: {
  flow: "setup" | "upgrade";
  toPlan?: string;
  reason?: string;
  onResolved: (result: "applied" | "requested") => void;
}) {
  const [accepted, setAccepted] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const resolved = React.useRef(false);

  const resolve = React.useCallback(
    (r: "applied" | "requested") => {
      if (resolved.current) return;
      resolved.current = true;
      onResolved(r);
    },
    [onResolved],
  );

  React.useEffect(() => {
    if (!started) return;
    let active = true;
    fetch("/api/v1/client/billing/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow, toPlan, reason, acceptedTerms: true }),
    })
      .then(async (res) => ({ ok: res.ok, data: (await res.json().catch(() => null)) as (Intent & { error?: string }) | null }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data) {
          setError(ERR[data?.error ?? ""] ?? "Couldn't start the payment. Please try again.");
          return;
        }
        if (data.kind === "applied" || data.kind === "requested") {
          resolve(data.kind);
          return;
        }
        setIntent(data);
      })
      .catch(() => active && setError("Couldn't start the payment. Please try again."));
    return () => {
      active = false;
    };
  }, [started, flow, toPlan, reason, resolve]);

  async function finalize() {
    // Card already confirmed client-side; reconcile our DB from Stripe's truth, then resolve.
    // Fail-soft: the webhook also reconciles, so a hiccup here still settles shortly.
    await fetch("/api/v1/client/billing/reconcile", { method: "POST" }).catch(() => {});
    resolve("applied");
  }

  // Step 1 — required acceptance of the non-refundable terms before any charge.
  if (!started) {
    return (
      <div>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
          <p className="font-semibold text-stone-800">PageBee billing terms</p>
          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            Placeholder copy — replace with your lawyer-reviewed terms.
          </p>
          <p className="mt-2">
            The one-time setup fee is <strong>strictly non-refundable under any circumstances</strong>, including
            cancellation, downgrade, or non-use. Your plan then bills monthly and recurs automatically until you cancel.
            You may cancel anytime; cancellation takes effect at the end of your current billing period and the monthly
            fee already paid for that period is not refunded. Upgrading charges the non-refundable difference in setup
            fees between tiers plus the prorated monthly difference.
          </p>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400"
          />
          <span>I have read and agree to the billing terms, including that the setup fee is non-refundable.</span>
        </label>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <button
          onClick={() => setStarted(true)}
          disabled={!accepted}
          className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to payment
        </button>
      </div>
    );
  }

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!intent) return <p className="py-2 text-sm text-stone-500">Preparing secure checkout…</p>;
  if (intent.kind !== "card") return null; // resolved instantly; parent has moved on

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between border-b border-stone-100 pb-3">
        <span className="text-sm text-stone-600">Total due today</span>
        <span className="font-display text-xl text-stone-900">{formatUsd(intent.amountCents)}</span>
      </div>
      <StripePaymentElement
        clientSecret={intent.clientSecret}
        mode="payment"
        submitLabel={`Pay ${formatUsd(intent.amountCents)}`}
        returnUrl={typeof window !== "undefined" ? window.location.href : "/client/billing"}
        onSuccess={finalize}
      />
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-stone-400">
        <ShieldCheck size={13} /> Encrypted &amp; processed securely. We never see your card number.
      </p>
    </div>
  );
}
