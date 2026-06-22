"use client";

import * as React from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { ConnectComponentsProvider, ConnectDocuments } from "@stripe/react-connect-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/**
 * Official Stripe-issued tax forms (1099-K) for a PageBee Pay (Custom) connected account, rendered
 * via Stripe's embedded Connect "Documents" component — Custom accounts have no Stripe dashboard, so
 * this is how the owner downloads their official form from inside PageBee. ConnectJS only runs in the
 * browser, so the instance is created in an effect (SSR-safe). Renders Stripe's own empty-state until
 * 1099 reporting is enabled on the platform and a form has been generated (each January).
 */
export function TaxDocuments() {
  const [instance, setInstance] = React.useState<StripeConnectInstance | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!PUBLISHABLE_KEY) {
      setFailed(true);
      return;
    }
    try {
      setInstance(
        loadConnectAndInitialize({
          publishableKey: PUBLISHABLE_KEY,
          fetchClientSecret: async () => {
            const res = await fetch("/api/v1/client/finance/tax-forms/session", { method: "POST" });
            if (!res.ok) throw new Error("session_failed");
            const data = (await res.json()) as { clientSecret: string };
            return data.clientSecret;
          },
          appearance: { variables: { colorPrimary: "#f59e0b", borderRadius: "10px" } },
        }),
      );
    } catch {
      setFailed(true);
    }
  }, []);

  if (failed || !PUBLISHABLE_KEY) {
    return <p className="text-sm text-stone-500">Tax-form downloads aren&apos;t available right now.</p>;
  }
  if (!instance) {
    return <p className="text-sm text-stone-400">Loading your tax documents…</p>;
  }
  return (
    <ConnectComponentsProvider connectInstance={instance}>
      <ConnectDocuments />
    </ConnectComponentsProvider>
  );
}
