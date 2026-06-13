import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { getSchedulingSettings, icalToken } from "@/lib/modules/booking";
import { SchedulingSettings } from "@/components/client/SchedulingSettings";

export const dynamic = "force-dynamic";

export default async function AppointmentsSettingsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  // Only relevant when booking is enabled.
  if (!(ws.caps.booking && ws.choices.booking)) redirect("/client/appointments");

  const settings = await getSchedulingSettings(ws.client.id);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  const icalUrl = `${proto}://${root}/api/v1/ical/${icalToken(ws.client.id)}.ics`;

  return (
    <div>
      <Link href="/client/appointments" className="text-sm text-stone-500 hover:underline">
        ← Appointments
      </Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Availability</h1>
      <p className="mt-1 text-stone-500">Set your hours, days off, and capacity. These drive what customers can book.</p>
      <SchedulingSettings initial={settings} icalUrl={icalUrl} />
    </div>
  );
}
