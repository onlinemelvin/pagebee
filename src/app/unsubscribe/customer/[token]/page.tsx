"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type State = "loading" | "ready" | "unsubscribed" | "subscribed" | "invalid";

export default function CustomerUnsubscribePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = React.useState<State>("loading");
  const [business, setBusiness] = React.useState("this business");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/v1/public/customer-unsubscribe?token=${token}`)
      .then(async (r) => {
        if (!r.ok) return setState("invalid");
        const d = (await r.json()) as { businessName: string };
        setBusiness(d.businessName);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function act(action?: "resubscribe") {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/public/customer-unsubscribe?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action ? { action } : {}),
      });
      if (!r.ok) return setState("invalid");
      setState(action ? "subscribed" : "unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
      <div className="w-full max-w-md text-center">
        {state === "loading" && <p className="text-sm text-stone-500">Loading…</p>}

        {state === "invalid" && (
          <p className="rounded-xl border border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
            This unsubscribe link is invalid or has expired.
          </p>
        )}

        {state === "ready" && (
          <div>
            <h1 className="font-display text-2xl text-stone-900">Unsubscribe from {business}?</h1>
            <p className="mt-2 text-sm text-stone-500">
              You&apos;ll stop receiving promotional emails from <strong>{business}</strong>. You&apos;ll still get
              important emails like appointment confirmations and receipts.
            </p>
            <Button size="lg" className="mt-6" disabled={busy} onClick={() => act()}>
              {busy ? "Updating…" : "Unsubscribe"}
            </Button>
          </div>
        )}

        {state === "unsubscribed" && (
          <div>
            <h1 className="font-display text-2xl text-stone-900">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-stone-500">
              You won&apos;t receive promotional emails from <strong>{business}</strong> anymore.
            </p>
            <Button size="lg" variant="outline" className="mt-6" disabled={busy} onClick={() => act("resubscribe")}>
              {busy ? "Updating…" : "Re-subscribe"}
            </Button>
          </div>
        )}

        {state === "subscribed" && (
          <p className="rounded-xl border border-green-300 bg-green-50 p-5 text-sm text-green-800">
            You&apos;re subscribed again — welcome back!
          </p>
        )}
      </div>
    </main>
  );
}
