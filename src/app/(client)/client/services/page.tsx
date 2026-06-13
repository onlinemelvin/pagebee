import { getClientWorkspace } from "@/lib/modules/client";
import { listServices } from "@/lib/modules/service";
import { ServicesManager } from "@/components/client/ServicesManager";

export const dynamic = "force-dynamic";

export default async function ClientServicesPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  const services = await listServices(ws.client.id);

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Services</h1>
      <p className="mt-1 text-stone-500">The catalog of what you offer — one source of truth for bookings, your website, and invoices.</p>
      <ServicesManager services={services} />
    </div>
  );
}
