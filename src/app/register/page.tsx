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

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [email, setEmail] = React.useState("");
  const [plan, setPlan] = React.useState<PlanName | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const testMode = isTestEmail(email);

  async function submit() {
    setLoading(true);
    setError(null);
    const form = formRef.current!;
    const data = new FormData(form);

    const payload = {
      businessName: String(data.get("businessName") ?? ""),
      businessType: String(data.get("businessType") ?? "") || undefined,
      ownerName: String(data.get("ownerName") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? "") || undefined,
      password: String(data.get("password") ?? ""),
      plan: testMode ? undefined : plan ?? undefined,
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
      // Sign in with the password we just set, then route by role.
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.email,
        password: payload.password,
      });
      if (signInError) {
        // Account created but auto-login failed — send them to login.
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

  function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current?.reportValidity()) return;
    // Test signups skip plan selection entirely.
    if (testMode) {
      void submit();
    } else {
      setError(null);
      setStep(2);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) {
      setError("Please choose a plan.");
      return;
    }
    void submit();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-12">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-xl">🐝</span>
          <span className="font-display text-2xl font-semibold text-stone-900">PageBee</span>
        </Link>

        {/* Step 1: account + business */}
        <form ref={formRef} onSubmit={handleContinue} className={step === 1 ? "block" : "hidden"}>
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
              Test account detected (<code>@test.com</code>) — plan selection &amp; payment are skipped; you&apos;ll get full Automate access.
            </p>
          )}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
            {loading ? "Creating…" : testMode ? "Create test account" : "Continue"}
          </Button>
          <p className="mt-4 text-center text-sm text-stone-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-amber-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>

        {/* Step 2: plan selection */}
        {step === 2 && (
          <form onSubmit={handleCreate}>
            <h1 className="font-display text-3xl text-stone-900">Choose your plan</h1>
            <p className="mt-1 text-stone-500">You can change or upgrade later.</p>

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
                    <span className="font-display text-xl text-stone-900">{p.label}</span>
                    <span className="text-stone-900">
                      <span className="text-lg font-semibold">{formatUsd(p.monthlyFee)}</span>
                      <span className="text-sm text-stone-500">/mo + {formatUsd(p.setupFee)} setup</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{p.tagline}</p>
                </button>
              ))}
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={loading || !plan}>
                {loading ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
