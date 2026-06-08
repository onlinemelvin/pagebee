"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DEMO_SITE_TOKEN } from "@/lib/constants";

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/v1/public/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A generated client website sends its own site token here.
          Authorization: `Bearer ${DEMO_SITE_TOKEN}`,
        },
        body: JSON.stringify({
          type: "CONTACT_FORM",
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone") || undefined,
          message: data.get("message") || undefined,
          source: "/",
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      form.reset();
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
        <p className="font-display text-2xl text-stone-900">Thanks — we&apos;ll be in touch.</p>
        <p className="mt-2 text-sm text-stone-600">
          Your message landed in our system. A real client site would alert the business owner instantly.
        </p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => setStatus("idle")}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Jane Smith" autoComplete="name" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="jane@business.com" autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" autoComplete="tel" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="message">How can we help?</Label>
        <Textarea id="message" name="message" placeholder="Tell us about your business…" />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Get my free consultation"}
      </Button>
      <p className="text-xs text-stone-500">
        By submitting you agree to be contacted about your project. No spam, ever.
      </p>
    </form>
  );
}
