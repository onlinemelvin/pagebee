import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/ContactForm";
import { PLANS, PRICING_NOTE } from "@/lib/plans";
import { PLAN_BADGES } from "@/lib/planBadges";
import { formatUsd, cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing — PageBee",
  description: "Simple plans for local businesses: Launch, Connect, and Automate.",
};

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <h1 className="font-display text-4xl tracking-tight text-stone-900 sm:text-5xl">
          Simple pricing, built for you
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600">
          Built, hosted, maintained, and supported for you — without the expensive agency bill.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const badge = PLAN_BADGES[plan.name];
            return (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-8",
                plan.recommended
                  ? "border-amber-400 shadow-lg shadow-amber-100"
                  : badge
                    ? "border-emerald-300 shadow-lg shadow-emerald-100"
                    : "border-stone-200",
              )}
            >
              {badge && (
                <span className={cn("absolute -top-3 left-8 rounded-full px-3 py-1 text-xs font-semibold", badge.className)}>
                  {badge.label}
                </span>
              )}
              <h2 className="font-display text-2xl text-stone-900">{plan.label}</h2>
              <p className="mt-2 min-h-12 text-sm text-stone-600">{plan.tagline}</p>

              <div className="mt-6">
                <span className="text-4xl font-semibold text-stone-900">{formatUsd(plan.monthlyFee)}</span>
                <span className="text-stone-500">/month</span>
              </div>
              <p className="mt-1 text-sm text-stone-500">+ {formatUsd(plan.setupFee)} one-time setup</p>

              <Link href={`/register?plan=${plan.name}`} className="mt-6">
                <Button variant={plan.recommended ? "primary" : "outline"} className="w-full">
                  Get started
                </Button>
              </Link>

              <ul className="mt-8 space-y-3 text-sm text-stone-700">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3">
                    <Check size={18} className="mt-0.5 shrink-0 text-amber-500" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-xs text-stone-500">{PRICING_NOTE}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/#contact"><Button size="lg">Book a free consultation</Button></Link>
        </div>
      </section>

      <section id="contact" className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-2xl px-6 py-20">
          <h2 className="text-center font-display text-3xl tracking-tight text-stone-900">
            Talk to us
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-stone-600">
            Not sure which plan fits? Send a note and we&apos;ll recommend the right one.
          </p>
          <div className="mt-10 rounded-3xl border border-stone-200 bg-[var(--background)] p-6 sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
