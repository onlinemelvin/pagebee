import { getClientWorkspace } from "@/lib/modules/client";
import { listCustomers, customerCounts } from "@/lib/modules/customer";
import { CustomersManager } from "@/components/client/CustomersManager";

export const dynamic = "force-dynamic";

export default async function ClientCustomersPage() {
  // Reuse the workspace the layout already resolved (React cache()) — no extra tenant lookup.
  const ws = await getClientWorkspace();
  if (!ws) return null;

  // Available on every plan: a contact list owners build manually and that fills automatically from
  // their website's lead form (Connect+). No upgrade gate.
  const [customers, counts] = await Promise.all([
    listCustomers(ws.client.id, { archived: false }),
    customerCounts(ws.client.id),
  ]);

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Customers</h1>
      <p className="mt-1 text-stone-500">
        Your customer list. Add people yourself or let your website&apos;s contact form fill it in — then
        reuse them on invoices, appointments and more.
      </p>
      <CustomersManager initialCustomers={customers} initialCounts={counts} />
    </div>
  );
}
