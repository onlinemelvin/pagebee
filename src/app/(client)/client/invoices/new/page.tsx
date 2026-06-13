import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getClientWorkspace } from "@/lib/modules/client";
import { listBookableServices } from "@/lib/modules/service";
import { listTaxRates, getFinanceSettings, type DocType } from "@/lib/modules/finance";
import { DocumentEditor } from "@/components/client/finance/DocumentEditor";

export const dynamic = "force-dynamic";

const LABEL: Record<DocType, string> = { ESTIMATE: "Estimate", QUOTE: "Quote", INVOICE: "Invoice" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");

  const { type } = await searchParams;
  const docType: DocType = type === "ESTIMATE" || type === "QUOTE" ? type : "INVOICE";

  const [services, taxRates, settings, customers] = await Promise.all([
    listBookableServices(ws.client.id),
    listTaxRates(ws.client.id),
    getFinanceSettings(ws.client.id),
    prisma.customer.findMany({ where: { clientId: ws.client.id }, select: { id: true, name: true, email: true, phone: true, billingAddress: true }, orderBy: { name: "asc" } }),
  ]);
  const editorCustomers = customers.map((c) => ({ ...c, billingAddress: (c.billingAddress as { line1?: string; city?: string; state?: string; postalCode?: string; country?: string } | null) ?? null }));

  return (
    <div>
      <Link href="/client/invoices" className="text-sm text-stone-500 hover:underline">← Finance</Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">New {LABEL[docType].toLowerCase()}</h1>
      <DocumentEditor
        docType={docType}
        services={services.map((s) => ({ id: s.id, title: s.title, description: s.description, price: s.price, durationMinutes: s.durationMinutes }))}
        taxRates={taxRates}
        customers={editorCustomers}
        settings={{ currency: settings.currency, defaultTerms: settings.defaultTerms, defaultNotes: settings.defaultNotes }}
        taxMode={settings.taxMode}
      />
    </div>
  );
}
