"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Clock, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoVideo } from "./DemoVideo";
import { toggleFeature } from "@/app/(client)/client/_actions/features";

const PERKS = [
  { icon: CalendarCheck, title: "Online booking", desc: "Customers pick a time on your live site — no phone tag." },
  { icon: Clock, title: "Your hours, your rules", desc: "Set availability, buffers, and capacity so you only get bookable slots." },
  { icon: BellRing, title: "Confirmations & reminders", desc: "Automatic emails keep you and your customers in sync." },
];

/**
 * First-run screen for the Appointments tab (plan includes booking, but the owner hasn't turned it
 * on yet). Shows a walkthrough video + benefits and a single "Enable appointments" action. Enabling
 * flips the booking feature flag; the page then advances to availability setup. Booking does NOT
 * appear on the live site until availability is saved (see bookingEnabled).
 */
export function AppointmentsIntro({ videoUrl }: { videoUrl?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await toggleFeature("booking", true);
      if (!res.ok) {
        setError(res.message ?? "Couldn't enable appointments — please try again.");
        return;
      }
      router.refresh(); // → page re-renders into the availability-setup step
    } catch {
      setError("Couldn't enable appointments — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Appointments</h1>
      <p className="mt-1 text-stone-500">Let customers book you online, right from your website.</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-center">
        <DemoVideo url={videoUrl} />

        <div>
          <ul className="space-y-4">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <p.icon size={20} />
                </span>
                <div>
                  <p className="font-semibold text-stone-900">{p.title}</p>
                  <p className="text-sm text-stone-500">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-600">
            Once enabled, customers can request time slots directly. Confirm or decline requests
            promptly — unanswered bookings frustrate customers and cost you the job.
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={enable} disabled={busy}>
              {busy ? "Enabling…" : "Enable appointments"}
            </Button>
            <span className="text-sm text-stone-400">You&apos;ll set your availability next.</span>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
