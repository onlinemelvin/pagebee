"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
            <h1 className="font-display text-3xl text-stone-900">Choose your plan</h1>
            <p className="mt-1 text-stone-500">Pick what fits today — you can upgrade anytime.</p>

            <div className="mt-8 grid gap-4">
              {PLANS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => setPlan(p.name)}
                  className={cn(
                    "rounded-2xl border bg-white p-5 text-left transition-colors",
                    plan === p.name ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-xl text-stone-900">
                      {p.label}
                      {p.recommended && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">
                          Popular
                        </span>
                      )}
                    </span>
                    <span className="text-stone-900">
                      <span className="text-lg font-semibold">{formatUsd(p.monthlyFee)}</span>
                      <span className="text-sm text-stone-500">/mo + {formatUsd(p.setupFee)} setup</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{p.tagline}</p>
                </button>
              ))}
            </div>

            <Button size="lg" className="mt-6 w-full" disabled={!plan} onClick={() => plan && setStep("details")}>
              Continue
            </Button>
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
            <p className="mt-1 text-stone-500">Tell us about your business to get started.</p>

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
              {loading ? "Creating…" : "Create account"}
            </Button>
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
