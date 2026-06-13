import { getClientWorkspace } from "@/lib/modules/client";
import { listBookings, getSchedulingSettings } from "@/lib/modules/booking";
import { listBookableServices } from "@/lib/modules/service";
import { AppointmentsManager } from "@/components/client/AppointmentsManager";
import type { Appt, ApptService } from "@/components/client/appointments-types";

export const dynamic = "force-dynamic";

export default async function ClientAppointmentsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  const [bookings, settings, catalog] = await Promise.all([
    listBookings(ws.client.id),
    getSchedulingSettings(ws.client.id),
    listBookableServices(ws.client.id),
  ]);
  const services: ApptService[] = catalog.map((s) => ({ name: s.title, durationMinutes: s.durationMinutes }));

  const appointments: Appt[] = bookings.map((b) => ({
    id: b.id,
    serviceName: b.serviceName,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    status: b.status,
    customerId: b.customerId,
    customerName: b.customer?.name ?? null,
    customerEmail: b.customer?.email ?? null,
    customerPhone: b.customer?.phone ?? null,
    notes: b.notes,
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Appointments</h1>
      <p className="mt-1 text-stone-500">
        Manage bookings, reschedule, add walk-ins, and set your availability.
      </p>
      <AppointmentsManager appointments={appointments} settings={settings} services={services} />
    </div>
  );
}
