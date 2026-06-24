import { Lock } from "lucide-react";
import { planForFlag } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { planAccent } from "./plan-accent";
import { LockedUpgradeCTA } from "./LockedUpgradeCTA";

/** Shown in place of a feature's page when the current plan doesn't include it. The nav surfaces
 *  every feature to every plan (as an upsell); opening a locked one lands here. `flag` is the plan
 *  feature-flag that unlocks the page (e.g. "booking") — we resolve the unlocking plan from it.
 *  Kept intentionally light: a one-line pitch + the switch CTA. The plan's full details (features,
 *  pricing) live in the switch modal so we're not repetitive. */
export function UpgradeGate({ title, flag, blurb }: { title: string; flag: string; blurb?: string }) {
  const plan = planForFlag(flag);
  const planName = plan?.label ?? "a higher";
  const accent = planAccent(plan?.name);

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className={cn("rounded-3xl border bg-white/80 px-6 py-10 shadow-sm backdrop-blur sm:px-10", accent.gateBorder)}>
        <span className={cn("mx-auto grid h-14 w-14 place-items-center rounded-2xl", accent.gateIcon)}>
          <Lock size={26} />
        </span>
        <h1 className="mt-5 font-display text-2xl text-stone-900">{title} is a {planName} feature</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
          {blurb ?? `Switch to ${planName} to unlock ${title.toLowerCase()} — preview it free, pay only when you launch.`}
        </p>

        {/* The switch modal carries the full plan details (features + pricing) — keep this page light. */}
        <div className="mt-7 flex flex-col items-center gap-3">
          {plan && <LockedUpgradeCTA planName={plan.name} planLabel={plan.label} />}
        </div>
        <p className="mt-3 text-xs text-stone-400">Switching is free — you only pay the setup &amp; first month when you approve &amp; launch.</p>
      </div>
    </div>
  );
}
