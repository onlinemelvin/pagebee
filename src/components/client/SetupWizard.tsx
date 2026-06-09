"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  title: string;
  done: boolean;
  optional: boolean;
}

const QUESTIONS: Record<string, { q: string; note?: string; yes?: string }> = {
  website: { q: "First, let's create your website — the foundation of everything." },
  booking: {
    q: "Do you want to take appointments or bookings from your website?",
    note: "Great for services like consultations, test drives, or reservations.",
  },
  invoices: {
    q: "Do you want to send invoices and collect payments?",
    note: "Payments setup arrives soon — we'll switch it on for your dashboard.",
  },
};

export function SetupWizard({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const active = steps.find((s) => !s.done);
  if (!active) return null;
  const idx = steps.indexOf(active);
  const q = QUESTIONS[active.key] ?? { q: active.title };

  async function answer(key: string, enabled: boolean) {
    setBusy(true);
    try {
      await fetch("/api/v1/client/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-stone-900">Set up your account</h2>
        <span className="text-xs font-semibold text-amber-800">
          Step {idx + 1} of {steps.length}
        </span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={cn("h-1.5 flex-1 rounded-full", s.done ? "bg-amber-500" : i === idx ? "bg-amber-400" : "bg-amber-200")}
          />
        ))}
      </div>

      <div className="mt-5">
        <p className="text-lg font-medium text-stone-900">{q.q}</p>
        {q.note && <p className="mt-1 text-sm text-stone-600">{q.note}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {active.key === "website" ? (
            <Link href="/client/website">
              <Button size="lg">Create my website</Button>
            </Link>
          ) : (
            <>
              <Button size="lg" disabled={busy} onClick={() => answer(active.key, true)}>
                Yes, enable it
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => answer(active.key, false)}>
                Not now
              </Button>
            </>
          )}
        </div>
      </div>

      {steps.some((s) => s.done) && (
        <ul className="mt-6 space-y-1 text-sm text-stone-600">
          {steps.filter((s) => s.done).map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="text-green-600">✓</span> {s.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
