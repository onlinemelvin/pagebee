"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Phase = "idle" | "working" | "error";

export function WebsiteIntakeForm({ submitLabel = "Generate my website" }: { submitLabel?: string }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkOnce = React.useCallback(async (): Promise<"working" | "done" | "failed" | "none"> => {
    try {
      const res = await fetch("/api/v1/client/website/generate", { cache: "no-store" });
      if (!res.ok) return "none";
      const { job } = (await res.json()) as { job: { status: string } | null };
      if (!job) return "none";
      if (job.status === "QUEUED" || job.status === "GENERATING") return "working";
      if (job.status === "FAILED") return "failed";
      return "done";
    } catch {
      return "none";
    }
  }, []);

  const startPolling = React.useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(async () => {
      const s = await checkOnce();
      if (s === "done") {
        stopPolling();
        setPhase("idle");
        router.refresh();
      } else if (s === "failed") {
        stopPolling();
        setError("Generation failed. Please try again.");
        setPhase("error");
      }
    }, 4000);
  }, [checkOnce, router, stopPolling]);

  // Resume an in-progress job when the page (re)loads.
  React.useEffect(() => {
    (async () => {
      if ((await checkOnce()) === "working") {
        setPhase("working");
        startPolling();
      }
    })();
    return stopPolling;
  }, [checkOnce, startPolling, stopPolling]);

  function toList(value: FormDataEntryValue | null): string[] | undefined {
    const s = String(value ?? "").trim();
    if (!s) return undefined;
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    setPhase("working");
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
      if (res.status !== 202 && !res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Failed (${res.status})`);
      }
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  if (phase === "working") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
        <p className="font-medium text-stone-900">Generating your website…</p>
        <p className="mt-1 text-sm text-stone-600">
          This runs in the background and can take a minute. You can safely close this page — it&apos;ll
          be here for review when it&apos;s ready.
        </p>
      </div>
    );
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

      <Button type="submit" size="lg">
        {submitLabel}
      </Button>
    </form>
  );
}
