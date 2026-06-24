"use client";

import * as React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { PLANS, planRank } from "@/lib/plans";
import { UpgradeModal } from "./UpgradeModal";

/**
 * The website-page "Choose your plan" panel. Renders the tier cards and opens the shared, universal
 * UpgradeModal (which shows the full gain/lose diff + price difference + keep-picker). Switching is
 * free pre-launch; you pay only at Approve & Launch.
 */
export function TierSwitcher({ currentTierFallback }: { currentTierFallback: string }) {
  const [current, setCurrent] = React.useState(currentTierFallback);
  const [target, setTarget] = React.useState<string | null>(null);

  const refetch = React.useCallback(() => {
    fetch("/api/v1/client/website/tier-view")
      .then((r) => r.json().catch(() => null))
      .then((d: { selectedPlan?: string } | null) => d?.selectedPlan && setCurrent(d.selectedPlan))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <h2 className="font-display text-xl text-stone-900">Choose your plan</h2>
      <p className="mt-1 text-sm text-stone-500">
        Switch tiers freely to see your site on each — nothing is charged until you approve &amp; launch.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.name === current;
          const up = planRank(p.name) > planRank(current);
          return (
            <button
              key={p.name}
              onClick={() => !isCurrent && setTarget(p.name)}
              disabled={isCurrent}
              className={[
                "rounded-xl border p-4 text-left transition",
                isCurrent ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg text-stone-900">{p.label}</span>
                {isCurrent ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-950">Current</span>
                ) : up ? (
                  <ArrowUp size={16} className="text-emerald-500" />
                ) : (
                  <ArrowDown size={16} className="text-stone-400" />
                )}
              </div>
              <p className="mt-1 text-sm text-stone-500">${Math.round(p.monthlyFee / 100)}/mo · {p.maxPages} pages</p>
            </button>
          );
        })}
      </div>

      <UpgradeModal open={target !== null} onClose={() => { setTarget(null); refetch(); }} toPlan={target ?? ""} />
    </div>
  );
}
