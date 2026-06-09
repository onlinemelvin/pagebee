"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function WebsiteIntakeForm({ submitLabel = "Generate my website" }: { submitLabel?: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [engine, setEngine] = React.useState<string | null>(null);

  function toList(value: FormDataEntryValue | null): string[] | undefined {
    const s = String(value ?? "").trim();
    if (!s) return undefined;
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEngine(null);
    const data = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/v1/client/website/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about: String(data.get("about") ?? "") || undefined,
          services: toList(data.get("services")),
          serviceAreas: toList(data.get("serviceAreas")),
          hours: String(data.get("hours") ?? "") || undefined,
          tone: String(data.get("tone") ?? "") || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Generation failed (${res.status})`);
      }
      const result = (await res.json()) as { engine?: string };
      setEngine(result.engine ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="about">About your business</Label>
        <Textarea id="about" name="about" placeholder="What you do, who you serve, what makes you different…" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="services">Services (comma-separated)</Label>
        <Input id="services" name="services" placeholder="Deep cleaning, Move-out cleaning, Office cleaning" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="serviceAreas">Service areas (comma-separated)</Label>
        <Input id="serviceAreas" name="serviceAreas" placeholder="Austin, Round Rock, Cedar Park" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="hours">Business hours</Label>
          <Input id="hours" name="hours" placeholder="Mon–Fri 8am–6pm" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tone">Tone</Label>
          <Input id="tone" name="tone" placeholder="Friendly &amp; professional" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {engine && (
        <p className="text-sm text-green-700">
          Draft generated{engine === "stub" ? " (template — add OPENAI_API_KEY for AI copy)" : " with AI"}. It&apos;s now awaiting review.
        </p>
      )}

      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "Generating… this can take a few seconds" : submitLabel}
      </Button>
    </form>
  );
}
