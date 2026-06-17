import Link from "next/link";
import { prisma } from "@/lib/db";
import { getClientWorkspace } from "@/lib/modules/client";
import { listRecurringPlans } from "@/lib/modules/finance";
import { listBookableServices } from "@/lib/modules/service";
import { RecurringManager } from "@/components/client/finance/RecurringManager";
import { UpgradeGate } from "@/components/client/UpgradeGate";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.caps.invoices) return <UpgradeGate title="Recurring billing" flag="invoices" blurb="Bill repeat customers automatically — lawn care, cleaning, retainers — on the AUTOMATE plan." />;

  const [plans, services, customerRows] = await Promise.all([
    listRecurringPlans(ws.client.id),
    listBookableServices(ws.client.id),
    prisma.customer.findMany({ where: { clientId: ws.client.id, archivedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <Link href="/client/invoices" className="text-sm text-stone-500 hover:underline">← Finance</Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Recurring billing</h1>
      <p className="mt-1 text-stone-500">
        Bill repeat customers automatically — each cycle PageBee creates the invoice and emails it with a
        pay link (or auto-charges a saved card).
      </p>
      <RecurringManager
        initialPlans={plans}
        customers={customerRows.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
        services={services.map((s) => ({ id: s.id, title: s.title, price: s.price }))}
      />
    </div>
  );
}
