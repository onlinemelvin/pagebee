import { CheckCircle2, Circle } from "lucide-react";
import { SchedulingSettings } from "./SchedulingSettings";
import type { SchedulingSettings as SchedulingSettingsType } from "@/lib/modules/booking";

/**
 * Second onboarding step for Appointments: booking is enabled, but availability hasn't been saved
 * yet. Wraps the SchedulingSettings editor with a "you're almost there" framing. Saving persists
 * calendarSettings (SchedulingSettings calls router.refresh on save), which advances the page to the
 * live management view and lets the booking widget go live on the site.
 */
export function AppointmentsSetup({ initial, icalUrl }: { initial: SchedulingSettingsType; icalUrl?: string }) {
  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Set your availability</h1>
      <p className="mt-1 text-stone-500">
        Appointments are enabled. Set your hours, days off, and capacity — these decide what customers
        can book. Your scheduler goes live on your website once you save.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
          <CheckCircle2 size={16} /> Appointments enabled
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-stone-500">
          <Circle size={16} /> Set your availability
        </span>
      </div>

      <SchedulingSettings initial={initial} icalUrl={icalUrl} />
    </div>
  );
}
