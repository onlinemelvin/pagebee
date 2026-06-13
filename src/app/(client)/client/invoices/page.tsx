import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, FilePlus2, ScrollText, SlidersHorizontal, FileBarChart } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getFinanceDashboard, listDocuments } from "@/lib/modules/finance";
import { DocumentsTable } from "@/components/client/finance/DocumentsTable";
import { fmt } from "@/components/client/finance/money-format";

export const dynamic = "force-dynamic";

export default async function ClientInvoicesPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");

  const [dash, documents] = await Promise.all([getFinanceDashboard(ws.client.id), listDocuments(ws.client.id)]);

  const metrics = [
    { label: "Revenue (paid)", value: fmt(dash.totalPaid), sub: `${fmt(dash.thisMonthRevenue)} this month`, accent: "text-green-700" },
    { label: "Invoiced", value: fmt(dash.totalInvoiced), sub: `${dash.counts.paid} paid · ${dash.counts.drafts} drafts`, accent: "text-stone-900" },
    { label: "Outstanding", value: fmt(dash.outstanding), sub: `${dash.counts.outstanding} open · ${dash.counts.overdue} overdue`, accent: "text-amber-700" },
    { label: "Quotes / estimates", value: `${dash.counts.openQuotes + dash.counts.openEstimates}`, sub: `${dash.counts.openQuotes} quotes · ${dash.counts.openEstimates} estimates`, accent: "text-stone-900" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Finance</h1>
          <p className="mt-1 text-stone-500">Estimates, quotes, invoices, payments, and statements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/client/invoices/new?type=INVOICE" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300"><FilePlus2 size={16} /> New invoice</Link>
          <Link href="/client/invoices/new?type=ESTIMATE" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"><FileText size={16} /> Estimate</Link>
          <Link href="/client/invoices/new?type=QUOTE" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"><ScrollText size={16} /> Quote</Link>
          <Link href="/client/invoices/reports" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"><FileBarChart size={16} /> Tax &amp; reports</Link>
          <Link href="/client/invoices/settings" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"><SlidersHorizontal size={16} /> Settings</Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{m.label}</p>
            <p className={`mt-1 font-display text-2xl ${m.accent}`}>{m.value}</p>
            <p className="mt-0.5 text-xs text-stone-400">{m.sub}</p>
          </div>
        ))}
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

      <div className="mt-6">
        <DocumentsTable documents={documents} />
      </div>
    </div>
  );
}
