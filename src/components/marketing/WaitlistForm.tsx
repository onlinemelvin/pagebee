"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          name: data.get("name") || undefined,
          business: data.get("business") || undefined,
          source: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-6 text-center">
        <p className="font-display text-xl text-stone-900">You&apos;re on the list 🐝</p>
        <p className="mt-1 text-sm text-stone-600">
          We&apos;ll email you the moment PageBee opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Your name" autoComplete="name" aria-label="Your name" />
        <Input
          name="business"
          placeholder="Business name"
          autoComplete="organization"
          aria-label="Business name"
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          name="email"
          type="email"
          required
          placeholder="you@business.com"
          autoComplete="email"
          aria-label="Email address"
          className="flex-1"
        />
        <Button type="submit" size="lg" disabled={status === "submitting"} className="group">
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-stone-500">No spam — just a single email when we launch.</p>
    </form>
  );
}
