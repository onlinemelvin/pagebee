import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Download, FileText } from "lucide-react";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
import { getClientWorkspace } from "@/lib/modules/client";
import { getTaxReport, getIncomeReport, get1099Summary } from "@/lib/modules/finance";
import { ReportControls } from "@/components/client/finance/ReportControls";
import { fmt } from "@/components/client/finance/money-format";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");

  const { from: fromQ, to: toQ } = await searchParams;
  const now = new Date();
  const from = parseDate(fromQ, new Date(now.getFullYear(), 0, 1));
  const to = parseDate(toQ, now);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const year = now.getFullYear();
  const [tax, income, form1099] = await Promise.all([
    getTaxReport(ws.client.id, from, to),
    getIncomeReport(ws.client.id, from, to),
    get1099Summary(ws.client.id, year),
  ]);

  return (
    <div>
      <Link href="/client/invoices" className="text-sm text-stone-500 hover:underline">← Finance</Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Tax &amp; reports</h1>
      <p className="mt-1 text-stone-500">Download what you (or your accountant) need to file. Figures cover paid invoices in the selected period.</p>

      <div className="mt-6">
        <ReportControls from={fromStr} to={toStr} />
      </div>

      {/* Sales tax collected */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-stone-900">Sales tax collected</h2>
          <span className="text-sm text-stone-400">{fmt(tax.totalTax)} total</span>
        </div>
        {tax.rows.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">No paid invoices with tax in this period.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2">State</th>
                <th className="py-2 text-right">Taxable sales</th>
                <th className="py-2 text-right">Tax collected</th>
                <th className="py-2 text-right">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {tax.rows.map((r) => (
                <tr key={r.state} className="border-b border-stone-50">
                  <td className="py-2 font-medium text-stone-800">{r.state}</td>
                  <td className="py-2 text-right text-stone-600">{fmt(r.salesBase)}</td>
                  <td className="py-2 text-right text-stone-800">{fmt(r.taxCollected)}</td>
                  <td className="py-2 text-right text-stone-500">{r.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Income summary */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-stone-900">Income (collected)</h2>
          <span className="text-sm text-stone-400">{fmt(income.totalCollected)} · {income.invoiceCount} invoice{income.invoiceCount === 1 ? "" : "s"}</span>
        </div>
        <p className="mt-1 text-sm text-stone-500">Use the Income CSV above for your income-tax records.</p>
      </section>

      {/* 1099-K summary */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-stone-500" />
            <h2 className="font-display text-lg text-stone-900">1099-K summary · {year}</h2>
          </div>
          <div className="flex gap-2">
            <Link href={`/client/invoices/reports/1099-statement?year=${year}`} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              <FileText size={15} /> Statement
            </Link>
            <a href={`/api/v1/client/finance/reports/1099?year=${year}`} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              <Download size={15} /> CSV
            </a>
          </div>
        </div>
        <p className="mt-1 text-sm text-stone-500">Gross card payments through PageBee Pay — the figures that appear on your official 1099-K.</p>
        <div className="mt-3 flex gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Gross (Box 1a)</p>
            <p className="font-display text-2xl text-stone-900">{fmt(form1099.gross)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Transactions</p>
            <p className="font-display text-2xl text-stone-900">{form1099.count}</p>
          </div>
        </div>
        {form1099.gross > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {form1099.monthly.map((m) => (
              <div key={m.month} className="rounded-lg bg-stone-50 px-2 py-1.5 text-center">
                <p className="text-[10px] uppercase text-stone-400">{MONTH_ABBR[m.month - 1]}</p>
                <p className="text-xs font-medium text-stone-700">{fmt(m.amount)}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-stone-400">
          Your official IRS 1099-K (if your volume crosses the reporting threshold) is filed with the IRS and delivered to you by
          PageBee Pay each January — by email, with a mailed copy as backup — so there's nothing to file yourself. The summary above
          and the printable statement are for your own records.
        </p>
      </section>
    </div>
  );
}
