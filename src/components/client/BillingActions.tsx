"use client";

import * as React from "react";
import { CreditCard, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const ERR: Record<string, string> = {
  stripe_not_configured: "Card billing isn't set up yet — please check back soon.",
  no_subscription: "We couldn't find your plan. Contact support.",
  no_active_subscription: "Your plan isn't active yet, so there's nothing to cancel.",
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

/**
 * Shown on return from Stripe Checkout (`?checkout=success&session_id=…`). The page used to claim
 * "payment received" immediately, but the upgrade/launch only happens once the webhook fires — so if
 * the webhook is delayed or not configured it never applied. This polls the reconcile endpoint
 * (which applies the effect directly from the session) and shows an honest in-progress → received
 * state, then refreshes the page so the new plan is reflected.
 */
export function CheckoutStatusBanner({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<"working" | "done" | "slow">(sessionId ? "working" : "done");

  React.useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let tries = 0;

    async function tick() {
      tries++;
      try {
        const res = await fetch("/api/v1/client/billing/checkout/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await res.json().catch(() => null)) as { status?: string } | null;
        if (!active) return;
        if (res.ok && data?.status === "applied") {
          setState("done");
          // Clean the query (stops re-polling) and re-render with the updated plan.
          setTimeout(() => active && router.replace("/client/billing"), 1400);
          return;
        }
      } catch {
        /* transient — keep retrying */
      }
      if (!active) return;
      if (tries >= 12) setState("slow"); // give up actively polling; the webhook will catch up
      else setTimeout(tick, 1500);
    }
    tick();
    return () => { active = false; };
  }, [sessionId, router]);

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
        <CheckCircle2 size={18} className="shrink-0" /> Payment received — your plan is updated.
      </div>
    );
  }
  if (state === "slow") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={18} className="shrink-0" /> Payment received. We&apos;re still finalizing your plan — this can take a minute. Refresh shortly if it isn&apos;t reflected.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
      <Loader2 size={18} className="shrink-0 animate-spin text-amber-500" /> Payment in progress — finalizing your plan…
    </div>
  );
}

/**
 * Background reconcile for the launch (setup-fee) return — same root cause as above: the site only
 * goes live when the webhook fires. Silently polls the reconcile endpoint and refreshes once the
 * launch is applied, so the page's own live/paid confirmation reflects reality. Renders nothing.
 */
export function LaunchReconcile({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let tries = 0;
    async function tick() {
      tries++;
      try {
        const res = await fetch("/api/v1/client/billing/checkout/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await res.json().catch(() => null)) as { status?: string } | null;
        if (active && res.ok && data?.status === "applied") {
          router.refresh();
          return;
        }
      } catch {
        /* transient */
      }
      if (active && tries < 12) setTimeout(tick, 1500);
    }
    tick();
    return () => { active = false; };
  }, [sessionId, router]);
  return null;
}

/**
 * Cancel the PageBee subscription (graceful — access continues until the period ends), or undo a
 * scheduled cancellation. `cancelScheduled` + `accessUntil` come from the subscription row.
 */
export function CancelPlanButton({ cancelScheduled, accessUntil }: { cancelScheduled: boolean; accessUntil: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function post(action: "cancel" | "reactivate") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(ERR[data?.error ?? ""] ?? "Something went wrong — please try again.");
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong — please try again.");
      setBusy(false);
    }
  }

  if (cancelScheduled) {
    return (
      <div className="text-center">
        <p className="text-sm text-stone-600">
          Your plan is set to cancel{accessUntil ? ` on ${accessUntil}` : " at the end of your billing period"}.
        </p>
        <button onClick={() => post("reactivate")} disabled={busy} className="mt-2 text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-60">
          {busy ? "Working…" : "Keep my plan"}
        </button>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="text-center">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline">
          Cancel plan
        </button>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm text-stone-700">
            Cancel your plan? You&apos;ll keep access until the end of your current billing period{accessUntil ? ` (${accessUntil})` : ""}.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => setOpen(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-60">
              Keep plan
            </button>
            <button onClick={() => post("cancel")} disabled={busy} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60">
              {busy ? "Cancelling…" : "Cancel plan"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
