import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getTaxReport, getIncomeReport } from "@/lib/modules/finance";
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

  const [tax, income] = await Promise.all([getTaxReport(ws.client.id, from, to), getIncomeReport(ws.client.id, from, to)]);

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

      {/* 1099-K */}
      <section className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-stone-500" />
          <h2 className="font-display text-lg text-stone-900">1099-K</h2>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          If your card payments cross the IRS threshold, your <strong>1099-K</strong> is issued through PageBee Pay each January and will appear here to download. (No action needed.)
        </p>
      </section>
    </div>
  );
}
