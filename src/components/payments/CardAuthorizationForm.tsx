"use client";

import * as React from "react";
import { Check, ShieldCheck, Loader2 } from "lucide-react";
import { StripePaymentElement, cardEntryAvailable } from "@/components/payments/StripePaymentElement";
import { fmt } from "@/components/client/finance/money-format";

const INTERVAL_LABEL: Record<string, string> = {
  WEEKLY: "every week", BIWEEKLY: "every 2 weeks", MONTHLY: "every month",
  QUARTERLY: "every 3 months", YEARLY: "every year",
};

/** Build the exact card-on-file disclosure the customer accepts (stored verbatim as mandate evidence). */
function mandateText(businessName: string, amount: string, cadence: string): string {
  return `I authorize ${businessName} to charge my saved payment method ${amount} ${cadence} for the agreed services, until I cancel. I understand I can cancel anytime by contacting ${businessName}.`;
}

export function CardAuthorizationForm({
  token,
  businessName,
  amountPerCycle,
  currency,
  interval,
}: {
  token: string;
  businessName: string;
  amountPerCycle: number;
  currency: string;
  interval: string;
}) {
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cadence = INTERVAL_LABEL[interval] ?? "on a schedule";
  const amount = fmt(amountPerCycle, currency);
  const disclosure = mandateText(businessName, amount, cadence);

  // Create the SetupIntent up front so the element is ready; confirmation is still gated on consent.
  React.useEffect(() => {
    if (!cardEntryAvailable) return;
    let active = true;
    fetch(`/api/v1/public/authorize/${token}/setup-intent`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { clientSecret?: string; error?: string }) => {
        if (!active) return;
        if (d.clientSecret) setClientSecret(d.clientSecret);
        else setError("Card setup isn't available right now.");
      })
      .catch(() => active && setError("Card setup isn't available right now."));
    return () => { active = false; };
  }, [token]);

  async function onSaved(setupIntentId: string) {
    const res = await fetch(`/api/v1/public/authorize/${token}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntentId, mandateText: disclosure }),
    });
    if (res.ok) setDone(true);
    else setError("We saved your card but couldn't finish setup. Please contact the business.");
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-700"><Check size={24} /></span>
        <h2 className="mt-3 font-display text-xl text-stone-900">You&apos;re all set</h2>
        <p className="mt-1 text-sm text-stone-600">
          {businessName} will automatically charge {amount} {cadence}. You can cancel anytime by contacting them.
        </p>
      </div>
    );
  }

  if (!cardEntryAvailable) return <p className="text-sm text-stone-500">Card authorization isn&apos;t available right now.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
        <p><strong className="text-stone-900">{businessName}</strong> will charge <strong>{amount}</strong> {cadence} to the card you save below.</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-stone-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400" />
        <span>{disclosure}</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {clientSecret ? (
        <StripePaymentElement
          clientSecret={clientSecret}
          mode="setup"
          submitLabel="Authorize automatic payments"
          returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/authorize/${token}`}
          disabled={!consent}
          onSuccess={onSaved}
        />
      ) : !error ? (
        <p className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={15} className="animate-spin" /> Loading secure card form…</p>
      ) : null}

      <p className="inline-flex items-center gap-1.5 text-xs text-stone-400"><ShieldCheck size={13} /> Secured by Stripe · your card details never touch this business or PageBee</p>
    </div>
  );
}
