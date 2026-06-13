import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { getSchedulingSettings } from "@/lib/modules/booking";
import { SchedulingSettings } from "@/components/client/SchedulingSettings";

export const dynamic = "force-dynamic";

export default async function AppointmentsSettingsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  // Only relevant when booking is enabled.
  if (!(ws.caps.booking && ws.choices.booking)) redirect("/client/appointments");

  const settings = await getSchedulingSettings(ws.client.id);

  return (
    <div>
      <Link href="/client/appointments" className="text-sm text-stone-500 hover:underline">
        ← Appointments
      </Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Availability</h1>
      <p className="mt-1 text-stone-500">Set your hours, days off, and capacity. These drive what customers can book.</p>
      <SchedulingSettings initial={settings} />
    </div>
  );
}
