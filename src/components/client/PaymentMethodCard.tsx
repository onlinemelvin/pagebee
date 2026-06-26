"use client";

import * as React from "react";
import { CreditCard, X, CheckCircle2 } from "lucide-react";
import { StripePaymentElement } from "@/components/payments/StripePaymentElement";

type Card = { brand: string; last4: string; expMonth: number; expYear: number } | null;

function brandLabel(brand: string) {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

/**
 * Shows the saved billing card (brand •••• last4, expiry) and lets the owner add/replace it via our
 * embedded Payment Element (SetupIntent, mode="setup" — no charge). On success the new card becomes
 * the default for all PageBee billing.
 */
export function PaymentMethodCard() {
  const [card, setCard] = React.useState<Card>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/client/billing/payment-method");
      const data = (await res.json().catch(() => null)) as { card?: Card } | null;
      setCard(data?.card ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function startUpdate() {
    setError(null);
    setSaved(false);
    setOpen(true);
    setClientSecret(null);
    try {
      const res = await fetch("/api/v1/client/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup-intent" }),
      });
      const data = (await res.json().catch(() => null)) as { clientSecret?: string; error?: string } | null;
      if (!res.ok || !data?.clientSecret) throw new Error(data?.error ?? "failed");
      setClientSecret(data.clientSecret);
    } catch {
      setError("Couldn't start card update. Please try again.");
    }
  }

  async function onSaved(setupIntentId: string) {
    try {
      await fetch("/api/v1/client/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", setupIntentId }),
      });
      setSaved(true);
      await load();
      setTimeout(() => setOpen(false), 1200);
    } catch {
      setError("Card saved but we couldn't set it as default. Please retry.");
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-stone-500">
            <CreditCard size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-stone-800">Payment method</p>
            {loading ? (
              <p className="text-sm text-stone-400">Loading…</p>
            ) : card ? (
              <p className="text-sm text-stone-500">
                {brandLabel(card.brand)} •••• {card.last4} · expires {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
              </p>
            ) : (
              <p className="text-sm text-stone-500">No card on file</p>
            )}
          </div>
        </div>
        <button
          onClick={startUpdate}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          {card ? "Change" : "Add card"}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="font-display text-xl text-stone-900">{card ? "Change card" : "Add a card"}</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              {saved ? (
                <div className="py-4 text-center">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                  <p className="mt-3 text-sm text-stone-600">Your card is updated.</p>
                </div>
              ) : error ? (
                <p className="text-sm text-rose-600">{error}</p>
              ) : !clientSecret ? (
                <p className="py-2 text-sm text-stone-500">Preparing secure form…</p>
              ) : (
                <StripePaymentElement
                  clientSecret={clientSecret}
                  mode="setup"
                  submitLabel="Save card"
                  returnUrl={typeof window !== "undefined" ? window.location.href : "/client/billing"}
                  onSuccess={onSaved}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
