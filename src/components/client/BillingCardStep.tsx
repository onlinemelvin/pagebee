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
 * The embedded, white-label card step shared by the setup CTA and the upgrade modal. Fetches a
 * billing intent: if it resolves instantly (in-place upgrade / test account) or as an admin request,
 * it calls `onResolved` without ever showing a card; otherwise it mounts our own Payment Element
 * (Stripe iframes, PCI SAQ A — card data never touches our DOM) and, on confirmation, reconciles
 * before resolving. No redirect, no hosted Checkout, no Stripe chrome.
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
    let active = true;
    fetch("/api/v1/client/billing/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow, toPlan, reason }),
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
  }, [flow, toPlan, reason, resolve]);

  async function finalize() {
    // The card is already confirmed client-side; reconcile our DB from Stripe's truth, then resolve.
    // Fail-soft: the webhook also reconciles, so a hiccup here still settles shortly.
    await fetch("/api/v1/client/billing/reconcile", { method: "POST" }).catch(() => {});
    resolve("applied");
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
