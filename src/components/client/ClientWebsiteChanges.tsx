"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import { nextTier } from "@/lib/plans";

/**
 * Monthly-update quota panel for a LIVE site. The actions themselves live next to the live site
 * ("Preview / Request edits" to pin changes, "Regenerate from scratch" to rebuild) — this column
 * just shows how many updates are left and, once they're spent, the tier upsell.
 */
export function ClientWebsiteChanges({
  quota,
  planName,
  actions,
  bare = false,
}: {
  quota: { allowance: number; used: number; remaining: number };
  planName: string;
  /** The action buttons (Preview / Request edits, Regenerate) — shown beneath the quota sentence. */
  actions?: React.ReactNode;
  /** Render as a section inside another card (no own card chrome) — for the website top card. */
  bare?: boolean;
}) {
  const [upsell, setUpsell] = React.useState(false);

  const out = quota.remaining <= 0;
  const next = nextTier(planName);
  // Updates reset at the start of next calendar month (matches getUpdateQuota's UTC month window).
  const now = new Date();
  const resetLabel = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  return (
    <div className={bare ? "" : "mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-card"}>
      <div>
        <h2 className={bare ? "font-display text-lg text-stone-900" : "font-display text-xl text-stone-900"}>Make changes to your website</h2>
        <p className="mt-1 text-sm text-stone-500">
          <strong>{quota.used} of {quota.allowance}</strong> update{quota.allowance === 1 ? "" : "s"} used this month.
          Pin small tweaks with <strong>Preview / Request edits</strong>, or rebuild from scratch with{" "}
          <strong>Regenerate</strong>.
        </p>
      </div>

      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}

      {out && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-stone-900">
            You&apos;ve used all {quota.allowance} update{quota.allowance === 1 ? "" : "s"} this month.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Your updates reset on <span className="font-medium text-stone-800">{resetLabel}</span>
            {next ? " — or upgrade now for more." : "."}
          </p>
          {next && (
            <Button className="mt-3" onClick={() => setUpsell(true)}>
              Upgrade to {next.label} — {next.monthlyUpdates} updates / month
            </Button>
          )}
        </div>
      )}

      {next && <UpgradeModal open={upsell} onClose={() => setUpsell(false)} toPlan={next.name} reason="more_updates" />}
    </div>
  );
}
