"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isTestEmail } from "@/lib/modules/registration/schema";
import { PLANS, type PlanName } from "@/lib/plans";
import { PLAN_BADGES } from "@/lib/planBadges";
import { cn, formatUsd } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/Logo";

const ERROR_COPY: Record<string, string> = {
  email_taken: "An account with this email already exists. Try signing in.",
  invalid_plan: "That plan isn't available. Please pick another.",
  validation_error: "Please check the form and try again.",
};

export function RegisterForm({ initialPlan }: { initialPlan: PlanName | null }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"plan" | "details">(initialPlan ? "details" : "plan");
  const [plan, setPlan] = React.useState<PlanName | null>(initialPlan);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const testMode = isTestEmail(email);
  const selectedPlan = PLANS.find((p) => p.name === plan);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan) {
      setStep("plan");
      return;
    }
    setLoading(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const payload = {
      businessName: String(data.get("businessName") ?? ""),
      businessType: String(data.get("businessType") ?? "") || undefined,
      ownerName: String(data.get("ownerName") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? "") || undefined,
      password: String(data.get("password") ?? ""),
      plan,
    };

    try {
      const res = await fetch("/api/v1/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(ERROR_COPY[body?.error ?? ""] ?? body?.error ?? `Registration failed (${res.status})`);
      }
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.email,
        password: payload.password,
      });
      if (signInError) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-12">
      <div className={cn("mx-auto transition-all", step === "plan" ? "max-w-6xl" : "max-w-xl")}>
        <BrandLogo href="/" size={40} textClassName="text-2xl" className="mb-8" />

        {/* Step 1 — choose your plan */}
        {step === "plan" && (
          <section>
            {/* Free-preview banner — the core "preview before you pay" promise */}
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-950">
                  Free preview
                </span>
                No credit card required
              </span>
              <h1 className="mt-5 font-display text-4xl tracking-tight text-stone-900 sm:text-5xl">
                Choose your plan
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
                We&apos;ll build a free AI preview of your new site. You only pay the setup fee once
                you love it and want to launch — cancel anytime before then.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {PLANS.map((p) => {
                const badge = PLAN_BADGES[p.name];
                const selected = plan === p.name;
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => setPlan(p.name)}
                    aria-pressed={selected}
                    className={cn(
                      "lift relative flex flex-col rounded-3xl border bg-white p-8 text-left transition-all",
                      selected
                        ? "border-amber-400 ring-2 ring-amber-300"
                        : p.recommended
                          ? "border-amber-300 shadow-lg shadow-amber-100 hover:border-amber-400"
                          : badge
                            ? "border-emerald-300 shadow-lg shadow-emerald-100 hover:border-emerald-400"
                            : "border-stone-200 hover:border-stone-300 hover:shadow-md",
                    )}
                  >
                    {badge && (
                      <span className={cn("absolute -top-3 left-8 rounded-full px-3 py-1 text-xs font-semibold", badge.className)}>
                        {badge.label}
                      </span>
                    )}
                    {/* Selection indicator */}
                    <span
                      className={cn(
                        "absolute right-6 top-6 grid h-6 w-6 place-items-center rounded-full border transition-colors",
                        selected ? "border-amber-400 bg-amber-400 text-stone-950" : "border-stone-300 text-transparent",
                      )}
                    >
                      <Check size={14} />
                    </span>

                    <h2 className="font-display text-2xl text-stone-900">{p.label}</h2>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{p.cardSubtitle}</p>
                    <p className="mt-2 min-h-12 text-sm text-stone-600">{p.tagline}</p>

                    <div className="mt-6">
                      <span className="text-4xl font-semibold text-stone-900">{formatUsd(p.monthlyFee)}</span>
                      <span className="text-stone-500">/month</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">+ {formatUsd(p.setupFee)} one-time setup</p>

                    <span
                      className={cn(
                        "mt-6 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition-colors",
                        selected
                          ? "bg-amber-400 text-stone-950"
                          : "border border-stone-300 text-stone-900",
                      )}
                    >
                      {selected ? "Selected" : "Select plan"}
                    </span>

                    <ul className="mt-8 space-y-3 text-sm text-stone-700">
                      {p.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-3">
                          <Check size={18} className="mt-0.5 shrink-0 text-amber-500" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="mx-auto mt-10 max-w-md">
              <Button size="lg" className="w-full" disabled={!plan} onClick={() => plan && setStep("details")}>
                {plan ? "Start free — pay only if you love it" : "Select a plan to continue"}
              </Button>
              <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-stone-500">
                <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500" /> No credit card required</span>
                <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500" /> Pay only when you launch</span>
              </p>
              <p className="mt-4 text-center text-sm text-stone-500">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-amber-700 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </section>
        )}

        {/* Step 2 — your details */}
        {step === "details" && (
          <form onSubmit={handleCreate}>
            <button
              type="button"
              onClick={() => setStep("plan")}
              className="mb-3 text-sm text-stone-500 hover:text-stone-900"
            >
              ← {selectedPlan?.label} plan · {selectedPlan ? `${formatUsd(selectedPlan.monthlyFee)}/mo` : ""} · change
            </button>
            <h1 className="font-display text-3xl text-stone-900">Create your account</h1>
            <p className="mt-1 text-stone-500">
              Tell us about your business and we&apos;ll build your free preview — no credit card required.
            </p>

            <div className="mt-8 grid gap-4">
              <Field label="Business name" name="businessName" required placeholder="Sparkle Cleaning Co." />
              <Field label="Business type" name="businessType" placeholder="Cleaning service" />
              <Field label="Your name" name="ownerName" required placeholder="Jane Smith" autoComplete="name" />
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="jane@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Field label="Phone (optional)" name="phone" type="tel" placeholder="(555) 123-4567" autoComplete="tel" />
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
              </div>
            </div>

            {testMode && (
              <p className="mt-4 rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm text-violet-800">
                Test account detected (<code>@test.com</code>) — full access on the {selectedPlan?.label} plan, no payment.
              </p>
            )}
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
              {loading ? "Creating…" : "Start free — build my preview"}
            </Button>
            <p className="mt-3 text-center text-xs text-stone-500">
              No credit card required. You only pay once you approve your preview and launch.
            </p>
            <p className="mt-4 text-center text-sm text-stone-500">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-amber-700 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  label, name, type = "text", required, placeholder, autoComplete,
}: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
