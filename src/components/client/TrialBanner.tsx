"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { TrialInfo } from "@/lib/modules/client";

export function TrialBanner({ trial }: { trial: TrialInfo }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  // Trial paused — site is down until they pay.
  if (trial.ended) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-red-600 px-6 py-2 text-sm text-white">
        <span>Your trial has ended and your site is paused. Add a card to bring it back online.</span>
        <a href="/client/billing" className="rounded-lg bg-white px-3 py-1 font-semibold text-red-700">
          Reactivate
        </a>
      </div>
    );
  }

  if (trial.status !== "TRIAL") return null;

  const days = trial.daysLeft ?? 0;
  const dayLabel = `${days} day${days === 1 ? "" : "s"} left in your free trial`;

  // After they skip, keep a slim non-nagging indicator.
  if (trial.cardSkipped) {
    return (
      <div className="bg-amber-100 px-6 py-1.5 text-center text-xs font-medium text-amber-800">{dayLabel}</div>
    );
  }

  async function skip() {
    setBusy(true);
    try {
      await fetch("/api/v1/client/trial/skip-card", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-400 px-6 py-2 text-sm text-stone-950">
      <span className="font-medium">
        {dayLabel}. Add a card so your service isn&apos;t interrupted.
      </span>
      <div className="flex items-center gap-2">
        <a href="/client/billing">
          <Button size="sm">Add a card</Button>
        </a>
        <button onClick={skip} disabled={busy} className="text-sm font-medium text-stone-700 hover:text-stone-950">
          Skip for now
        </button>
      </div>
    </div>
  );
}
