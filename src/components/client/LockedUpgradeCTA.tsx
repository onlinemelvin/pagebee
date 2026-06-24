"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { UpgradeModal } from "./UpgradeModal";

/**
 * The CTA shown on a locked feature's UpgradeGate. Opens the SAME plan-switch modal as the billing
 * page (one consistent experience): pre-launch it switches the tier in the background for free (the
 * feature unlocks in place, no redirect); live accounts pay the difference.
 */
export function LockedUpgradeCTA({ planName, planLabel }: { planName: string; planLabel: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-amber-300"
      >
        <ArrowUpRight size={16} /> Switch to {planLabel}
      </button>
      <UpgradeModal open={open} onClose={() => setOpen(false)} toPlan={planName} />
    </>
  );
}
