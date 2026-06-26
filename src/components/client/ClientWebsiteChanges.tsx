"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import { nextTier } from "@/lib/plans";

/**
 * Out-of-quota upsell for a LIVE site's monthly updates. Renders nothing while updates remain —
 * the quota count and the actions (Preview / Request edits, Regenerate) live inline on the live
 * card. When updates are spent, shows the reset date and an upgrade CTA.
 */
export function ClientWebsiteChanges({
  quota,
  planName,
}: {
  quota: { allowance: number; remaining: number };
  planName: string;
}) {
  const [upsell, setUpsell] = React.useState(false);
  const next = nextTier(planName);
  if (quota.remaining > 0) return null;

  // Updates reset at the start of next calendar month (matches getUpdateQuota's UTC month window).
  const now = new Date();
  const resetLabel = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  return (
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
      {next && <UpgradeModal open={upsell} onClose={() => setUpsell(false)} toPlan={next.name} reason="more_updates" />}
    </div>
  );
}
