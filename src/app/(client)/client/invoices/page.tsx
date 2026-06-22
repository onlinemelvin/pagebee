import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, ReceiptText, Clock3, ScrollText, CalendarClock, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getClientWorkspace } from "@/lib/modules/client";
import { getFinanceDashboard, listDocuments, listTaxRates, getFinanceSettings, pastUninvoicedAppointments } from "@/lib/modules/finance";
import { listBookableServices } from "@/lib/modules/service";
import { DocumentsTable } from "@/components/client/finance/DocumentsTable";
import { FinanceActions } from "@/components/client/finance/FinanceActions";
import { CustomerResponses } from "@/components/client/finance/CustomerResponses";
import { UpgradeGate } from "@/components/client/UpgradeGate";
import { StatCard } from "@/components/client/ui/StatCard";
import { fmt } from "@/components/client/finance/money-format";

export const dynamic = "force-dynamic";

export default async function ClientInvoicesPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.finance.view) redirect("/client"); // staff without finance access
  // Finance (invoices/payments/statements) is an Automate feature; surfaced to every tier as an
  // upsell, gated here for lower plans. On-plan owners reach the dashboard whether or not they've
  // toggled it on yet — the feature card still governs what's live on their public site.
  if (!ws.caps.invoices) return <UpgradeGate title="Finance" flag="invoices" blurb="Send invoices, take card payments, and share statements — available on the HIVE plan." />;

  const [dash, documents, services, taxRates, settings, customerRows, uninvoiced] = await Promise.all([
    getFinanceDashboard(ws.client.id),
    listDocuments(ws.client.id),
    listBookableServices(ws.client.id),
    listTaxRates(ws.client.id),
    getFinanceSettings(ws.client.id),
    prisma.customer.findMany({ where: { clientId: ws.client.id, archivedAt: null }, select: { id: true, name: true, email: true, phone: true, billingAddress: true }, orderBy: { name: "asc" } }),
    ws.caps.booking ? pastUninvoicedAppointments(ws.client.id) : Promise.resolve(0),
  ]);
  const customers = customerRows.map((c) => ({ ...c, billingAddress: (c.billingAddress as { line1?: string; city?: string; state?: string; postalCode?: string; country?: string } | null) ?? null }));
  const editorServices = services.map((s) => ({ id: s.id, title: s.title, description: s.description, price: s.price, durationMinutes: s.durationMinutes }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Finance</h1>
          <p className="mt-1 text-stone-500">Estimates, quotes, invoices, payments, and statements.</p>
        </div>
        <FinanceActions
          services={editorServices}
          taxRates={taxRates}
          customers={customers}
          settings={{ currency: settings.currency, defaultTerms: settings.defaultTerms, defaultNotes: settings.defaultNotes }}
          taxMode={settings.taxMode}
        />
      </div>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={0} icon={Wallet} accent="emerald" label={`Revenue · ${fmt(dash.thisMonthRevenue)} this month`} value={dash.totalPaid} cents prefix="$" />
        <StatCard index={1} icon={ReceiptText} accent="amber" label={`Invoiced · ${dash.counts.paid} paid, ${dash.counts.drafts} drafts`} value={dash.totalInvoiced} cents prefix="$" />
        <StatCard index={2} icon={Clock3} accent="orange" label={`Outstanding · ${dash.counts.outstanding} open, ${dash.counts.overdue} overdue`} value={dash.outstanding} cents prefix="$" />
        <StatCard index={3} icon={ScrollText} accent="violet" label={`${dash.counts.openQuotes} quotes · ${dash.counts.openEstimates} estimates`} value={dash.counts.openQuotes + dash.counts.openEstimates} />
      </div>

      {/* Aging */}
      {dash.outstanding > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Current", v: dash.aging.current },
            { label: "1–30d", v: dash.aging.d1_30 },
            { label: "31–60d", v: dash.aging.d31_60 },
            { label: "61–90d", v: dash.aging.d61_90 },
            { label: "90d+", v: dash.aging.d90 },
          ].map((b) => (
            <div key={b.label} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-center">
              <p className="text-[11px] uppercase text-stone-400">{b.label}</p>
              <p className="text-sm font-semibold text-stone-800">{fmt(b.v)}</p>
            </div>
          ))}
        </div>
      )}

      {uninvoiced > 0 && (
        <Link href="/client/appointments" className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <CalendarClock size={18} className="shrink-0" />
          <span className="flex-1">
            <strong>{uninvoiced}</strong> completed appointment{uninvoiced === 1 ? " hasn't" : "s haven't"} been invoiced yet.
          </span>
          <span className="inline-flex items-center gap-1 font-semibold">Review <ArrowRight size={14} /></span>
        </Link>
      )}

      <CustomerResponses documents={documents} />

      <div className="mt-6">
        <DocumentsTable documents={documents} />
      </div>
    </div>
  );
}
