"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, planRank, planLimitRows } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";

/** Three-up plan picker for the billing page. Marks the current plan and opens the
 *  upgrade modal for higher tiers (test accounts apply instantly; real accounts request). */
export function PlanComparison({ currentPlan }: { currentPlan: string }) {
  const [upgradeTo, setUpgradeTo] = React.useState<string | null>(null);
  const currentRank = planRank(currentPlan);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const rank = planRank(p.name);
          const isCurrent = rank === currentRank;
          const isUpgrade = rank > currentRank;
          return (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-white p-5",
                isCurrent ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200",
              )}
            >
              {p.recommended && !isCurrent && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Popular</span>
              )}
              {isCurrent && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-950">Current plan</span>
              )}
              <p className="font-display text-xl text-stone-900">{p.label}</p>
              <p className="mt-0.5 text-sm text-stone-500">{p.tagline}</p>
              <p className="mt-3">
                <span className="font-display text-3xl text-stone-900">${Math.round(p.monthlyFee / 100)}</span>
                <span className="text-sm text-stone-400">/mo</span>
              </p>
              <p className="text-xs text-stone-400">+ ${Math.round(p.setupFee / 100)} one-time setup</p>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {planLimitRows(p).map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">{r.label}</span>
                    <span className="font-semibold text-stone-800">{r.value}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Your plan</Button>
                ) : isUpgrade ? (
                  <Button className="w-full" onClick={() => setUpgradeTo(p.name)}>Upgrade to {p.label}</Button>
                ) : (
                  <Button variant="ghost" className="w-full" disabled>Included below</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <UpgradeModal open={upgradeTo !== null} onClose={() => setUpgradeTo(null)} toPlan={upgradeTo ?? ""} reason="billing page" />
    </>
  );
}
