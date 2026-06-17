import Link from "next/link";
import { Lock, ArrowUpRight, Check } from "lucide-react";
import { planForFlag } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { planAccent } from "./plan-accent";

/** Shown in place of a feature's page when the current plan doesn't include it. The nav surfaces
 *  every feature to every plan (as an upsell); opening a locked one lands here. `flag` is the plan
 *  feature-flag that unlocks the page (e.g. "booking") — we resolve the unlocking plan from it. */
export function UpgradeGate({ title, flag, blurb }: { title: string; flag: string; blurb?: string }) {
  const plan = planForFlag(flag);
  const planName = plan?.name ?? "a higher";
  const accent = planAccent(plan?.name); // tint the gate to the unlocking plan; CTA stays honey/amber

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className={cn("rounded-3xl border bg-white/80 px-6 py-10 shadow-sm backdrop-blur sm:px-10", accent.gateBorder)}>
        <span className={cn("mx-auto grid h-14 w-14 place-items-center rounded-2xl", accent.gateIcon)}>
          <Lock size={26} />
        </span>
        <h1 className="mt-5 font-display text-2xl text-stone-900">
          {title} is part of the {planName} plan
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
          {blurb ?? `Upgrade to ${planName} plan to unlock ${title.toLowerCase()} and bring it to your website.`}
        </p>

        {plan?.highlights?.length ? (
          <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
            {plan.highlights.slice(0, 4).map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-stone-600">
                <Check size={16} className={cn("mt-0.5 shrink-0", accent.gateCheck)} /> {h}
              </li>
            ))}
          </ul>
        ) : null}

        <Link
          href="/client/billing"
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-amber-300"
        >
          <ArrowUpRight size={16} /> Upgrade to {planName} plan
        </Link>
      </div>
    </div>
  );
}
