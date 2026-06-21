"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/Logo";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    const confirm = String(data.get("confirm"));
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/public/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          body.error === "invalid_or_expired_token"
            ? "This reset link is invalid or has expired. Please request a new one."
            : "Couldn't reset your password. Please try again.",
        );
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
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
        <h1 className="font-display text-2xl text-stone-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-stone-500">Pick a strong password you don&apos;t use elsewhere.</p>

        {done ? (
          <p className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800" role="status">
            Your password has been changed. Redirecting you to sign in…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" minLength={8} />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Saving…" : "Set new password"}
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
