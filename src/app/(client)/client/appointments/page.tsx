import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { listBookings, getSchedulingSettings, hasSchedulingSettings, icalToken } from "@/lib/modules/booking";
import { listBookableServices } from "@/lib/modules/service";
import { bookingInvoiceStatuses } from "@/lib/modules/finance";
import { AppointmentsManager } from "@/components/client/AppointmentsManager";
import { AppointmentsIntro } from "@/components/client/AppointmentsIntro";
import { AppointmentsSetup } from "@/components/client/AppointmentsSetup";
import { UpgradeGate } from "@/components/client/UpgradeGate";
import type { Appt, ApptService } from "@/components/client/appointments-types";

export const dynamic = "force-dynamic";

export default async function ClientAppointmentsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.appointments.view) redirect("/client"); // staff without appointments access
  // Booking is a Honey+ feature; surfaced to every tier in the nav, gated here for lower plans.
  if (!ws.caps.booking) return <UpgradeGate title="Appointments" flag="booking" blurb="Let customers book and reschedule online, with availability and walk-in management — available on the HONEY plan and up." />;

  // First-run onboarding: enable → set availability → manage. Booking goes live on the site only
  // after both steps are done (see bookingEnabled). Staff who can't change settings skip to manage.
  if (ws.access.appointments.manage) {
    if (!ws.choices.booking) {
      return <AppointmentsIntro videoUrl={process.env.NEXT_PUBLIC_BOOKING_DEMO_VIDEO_URL ?? process.env.NEXT_PUBLIC_DEMO_VIDEO_URL} />;
    }
    if (!(await hasSchedulingSettings(ws.client.id))) {
      const settings = await getSchedulingSettings(ws.client.id);
      const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
      const proto = root.includes("localhost") ? "http" : "https";
      const icalUrl = `${proto}://${root}/api/v1/ical/${icalToken(ws.client.id)}.ics`;
      return <AppointmentsSetup initial={settings} icalUrl={icalUrl} />;
    }
  }

  const [bookings, settings, catalog] = await Promise.all([
    listBookings(ws.client.id),
    getSchedulingSettings(ws.client.id),
    listBookableServices(ws.client.id),
  ]);
  const services: ApptService[] = catalog.map((s) => ({ name: s.title, durationMinutes: s.durationMinutes }));

  // Finance is an Automate feature; only fetch linked-invoice statuses (and show the invoice action)
  // when this plan includes it.
  const invoiceMap = ws.caps.invoices ? await bookingInvoiceStatuses(ws.client.id, bookings.map((b) => b.id)) : {};

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
    invoice: invoiceMap[b.id] ?? null,
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Appointments</h1>
      <p className="mt-1 text-stone-500">
        Manage bookings, reschedule, add walk-ins, and set your availability.
      </p>
      <AppointmentsManager appointments={appointments} settings={settings} services={services} financeEnabled={ws.caps.invoices} />
    </div>
  );
}
