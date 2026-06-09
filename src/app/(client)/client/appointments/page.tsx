import { getCurrentClient } from "@/lib/auth/session";
import { listBookings } from "@/lib/modules/booking";
import { ClientAppointments, type AppointmentRow } from "@/components/client/ClientAppointments";

export const dynamic = "force-dynamic";

export default async function ClientAppointmentsPage() {
  const result = await getCurrentClient();
  if (!result) return null;

  const bookings = await listBookings(result.client.id);
  const appointments: AppointmentRow[] = bookings.map((b) => ({
    id: b.id,
    serviceName: b.serviceName,
    startAt: b.startAt.toISOString(),
    status: b.status,
    customerName: b.customer?.name ?? null,
    customerEmail: b.customer?.email ?? null,
    customerPhone: b.customer?.phone ?? null,
    notes: b.notes,
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Appointments</h1>
      <p className="mt-1 text-stone-500">Booking requests from your website. Confirm or cancel to notify the customer.</p>
      <ClientAppointments appointments={appointments} />
    </div>
  );
}
