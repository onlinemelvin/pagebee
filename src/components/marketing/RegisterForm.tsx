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
import { cn, formatUsd } from "@/lib/utils";

const ERROR_COPY: Record<string, string> = {
  email_taken: "An account with this email already exists. Try signing in.",
  invalid_plan: "That plan isn't available. Please pick another.",
  validation_error: "Please check the form and try again.",
};

// Presentation-only "excitement" tags for the choose-plan step (keyed by plan).
const PLAN_BADGES: Record<PlanName, { label: string; className: string }> = {
  LAUNCH: { label: "🌱 Great start", className: "bg-emerald-100 text-emerald-800" },
  CONNECT: { label: "🔥 Most popular", className: "bg-amber-400 text-stone-950" },
  AUTOMATE: { label: "⚡ Most powerful", className: "bg-violet-100 text-violet-800" },
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
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-xl">🐝</span>
          <span className="font-display text-2xl font-semibold text-stone-900">PageBee</span>
        </Link>

        {/* Step 1 — choose your plan */}
        {step === "plan" && (
          <section>
            {/* Free-preview hero — the core "preview before you pay" promise */}
            <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-stone-950">
                  Free preview
                </span>
                <span className="text-sm font-semibold text-amber-900">No credit card required</span>
              </div>
              <p className="mt-2 font-display text-xl text-stone-900">
                See your website before you pay a cent. ✨
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Pick a plan and we&apos;ll build a free AI preview of your new site. You only pay the
                setup fee once you love it and want to launch — cancel anytime before then.
              </p>
            </div>

            <h1 className="mt-8 font-display text-3xl text-stone-900">Choose your plan</h1>
            <p className="mt-1 text-stone-500">Pick what fits today — you can upgrade anytime.</p>

            <div className="mt-6 grid gap-4">
              {PLANS.map((p) => {
                const badge = PLAN_BADGES[p.name];
                const selected = plan === p.name;
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => setPlan(p.name)}
                    className={cn(
                      "relative rounded-2xl border bg-white p-5 text-left transition-all",
                      selected
                        ? "border-amber-400 ring-2 ring-amber-200"
                        : p.recommended
                          ? "border-amber-300 shadow-sm shadow-amber-100 hover:border-amber-400"
                          : "border-stone-200 hover:border-stone-300 hover:shadow-sm",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-xs font-bold",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="font-display text-xl text-stone-900">{p.label}</span>
                      <span className="text-stone-900">
                        <span className="text-lg font-semibold">{formatUsd(p.monthlyFee)}</span>
                        <span className="text-sm text-stone-500">/mo + {formatUsd(p.setupFee)} setup</span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">{p.tagline}</p>
                    <ul className="mt-3 grid gap-1.5">
                      {p.highlights.slice(0, 3).map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-stone-700">
                          <Check size={16} className="mt-0.5 shrink-0 text-amber-500" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <Button size="lg" className="mt-6 w-full" disabled={!plan} onClick={() => plan && setStep("details")}>
              {plan ? `Get my free ${selectedPlan?.label} preview` : "Continue"}
            </Button>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-stone-500">
              <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500" /> No credit card required</span>
              <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500" /> Free website preview</span>
              <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500" /> Pay only when you launch</span>
            </p>
            <p className="mt-4 text-center text-sm text-stone-500">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-amber-700 hover:underline">
                Sign in
              </Link>
            </p>
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
              {loading ? "Creating…" : "Create account & get my free preview"}
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
