"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const ERR: Record<string, string> = {
  stripe_not_configured: "Card billing isn't set up yet — please check back soon.",
  no_subscription: "We couldn't find your plan. Contact support.",
};

/** Starts a Stripe Checkout session (setup fee + subscription, or an upgrade) and redirects. */
export function CheckoutButton({
  kind,
  toPlan,
  label,
  className,
}: {
  kind: "setup" | "upgrade";
  toPlan?: string;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, toPlan }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(ERR[data?.error ?? ""] ?? "Couldn't start checkout — please try again.");
      setBusy(false);
    } catch {
      setError("Couldn't start checkout — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={go}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60",
          className,
        )}
      >
        <CreditCard size={16} /> {busy ? "Starting checkout…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
