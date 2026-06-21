"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/Logo";

export default function ForgotPasswordPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/public/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(data.get("email")) }),
      });
      if (!res.ok && res.status !== 200) throw new Error("Something went wrong. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
      <div className="w-full max-w-sm">
        <BrandLogo href="/" size={40} textClassName="text-2xl" className="mb-8" priority />
        <h1 className="font-display text-2xl text-stone-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-stone-500">
          Enter your email and we&apos;ll send you a secure link to choose a new one.
        </p>

        {sent ? (
          <p className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800" role="status">
            If an account exists for that email, a password reset link is on its way. The link expires in 30 minutes.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-stone-500">
          <Link href="/login" className="font-medium text-amber-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
