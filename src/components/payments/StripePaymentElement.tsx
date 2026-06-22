"use client";

import * as React from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";

// Publishable key is safe to expose; the secret never touches the client.
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;
function stripeClient(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

/** True when embedded card entry is configured (otherwise callers fall back to hosted Checkout). */
export const cardEntryAvailable = Boolean(PUBLISHABLE_KEY);

/**
 * White-label card entry via Stripe's Payment Element. Card data goes straight to Stripe inside the
 * element's iframe (PCI SAQ A) — it never touches our DOM or servers. Drives both a PaymentIntent
 * ("payment", pay an invoice) and a SetupIntent ("setup", save a card for recurring) off one
 * `clientSecret`. `onSuccess` fires with the confirmed intent id after `redirect: "if_required"`.
 */
export function StripePaymentElement({
  clientSecret,
  mode,
  submitLabel,
  returnUrl,
  disabled,
  onSuccess,
}: {
  clientSecret: string;
  mode: "payment" | "setup";
  submitLabel: string;
  returnUrl: string;
  disabled?: boolean;
  onSuccess: (intentId: string) => void;
}) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const stripeRef = React.useRef<Stripe | null>(null);
  const elementsRef = React.useRef<StripeElements | null>(null);
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    stripeClient().then((stripe) => {
      if (!active || !stripe || !mountRef.current) return;
      const elements = stripe.elements({
        clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#f59e0b", borderRadius: "10px" } },
      });
      const paymentElement = elements.create("payment");
      paymentElement.mount(mountRef.current);
      paymentElement.on("ready", () => active && setReady(true));
      stripeRef.current = stripe;
      elementsRef.current = elements;
    });
    return () => {
      active = false;
    };
  }, [clientSecret]);

  if (!cardEntryAvailable) {
    return <p className="text-sm text-stone-500">Card entry isn&apos;t available right now.</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);

    const confirmParams = { return_url: returnUrl };
    const result =
      mode === "payment"
        ? await stripe.confirmPayment({ elements, confirmParams, redirect: "if_required" })
        : await stripe.confirmSetup({ elements, confirmParams, redirect: "if_required" });

    if (result.error) {
      setError(result.error.message ?? "We couldn't process that. Please try another card.");
      setBusy(false);
      return;
    }
    const intent = "paymentIntent" in result ? result.paymentIntent : result.setupIntent;
    if (intent && (intent.status === "succeeded" || intent.status === "processing")) {
      onSuccess(intent.id); // keep busy=true — the parent transitions to a success/redirect state
    } else {
      setError("Payment could not be completed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div ref={mountRef} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!ready || busy || disabled} className="w-full">
        {busy ? "Processing…" : submitLabel}
      </Button>
    </form>
  );
}
