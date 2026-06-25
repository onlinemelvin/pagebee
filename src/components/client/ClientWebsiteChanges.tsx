"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { WebsiteIntakeForm } from "./WebsiteIntakeForm";
import { UpgradeModal } from "./UpgradeModal";
import { nextTier } from "@/lib/plans";

/**
 * "Rebuild" surface for a LIVE site: a "Regenerate from scratch" (full intake form) action, gated
 * by the plan's monthly update quota. Minor tweaks now go through "Preview / Request edits" (pin
 * comments on the live site); this card is just the full-rebuild path. Quota spent → tier upsell.
 */
export function ClientWebsiteChanges({
  quota,
  planName,
  maxPages,
  canBook,
  canUseForms,
  bare = false,
}: {
  quota: { allowance: number; used: number; remaining: number };
  planName: string;
  maxPages: number;
  canBook: boolean;
  canUseForms: boolean;
  /** Render as a section inside another card (no own card chrome) — for the website top card. */
  bare?: boolean;
}) {
  const [mode, setMode] = React.useState<null | "regen">(null);
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
        <h2 className={bare ? "font-display text-lg text-stone-900" : "font-display text-xl text-stone-900"}>Rebuild your website</h2>
        <p className="mt-1 text-sm text-stone-500">
          Need a fresh start? Regenerate from updated details — <strong>{quota.used} of {quota.allowance}</strong> update
          {quota.allowance === 1 ? "" : "s"} used this month. For small tweaks, use <strong>Preview / Request edits</strong>.
        </p>
      </div>

      {out ? (
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
      ) : mode === null ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("regen")}>
            Regenerate from scratch
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-500">Rebuild your whole site from updated details — uses one monthly update.</p>
            <button onClick={() => setMode(null)} className="text-sm text-stone-500 hover:underline">
              Cancel
            </button>
          </div>
          <div className="mt-4">
            <WebsiteIntakeForm
              submitLabel="Regenerate from scratch"
              maxPages={maxPages}
              canBook={canBook}
              canUseForms={canUseForms}
            />
          </div>
        </div>
      )}

      {next && <UpgradeModal open={upsell} onClose={() => setUpsell(false)} toPlan={next.name} reason="more_updates" />}
    </div>
  );
}
