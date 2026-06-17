import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientWorkspace } from "@/lib/modules/client";
import { get1099Summary, getFinanceSettings } from "@/lib/modules/finance";
import { fmt } from "@/components/client/finance/money-format";
import { PrintButton } from "@/components/client/finance/PrintButton";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function Form1099StatementPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.caps.invoices) redirect("/client/invoices"); // off-plan → finance index shows the upgrade gate

  const { year: yearQ } = await searchParams;
  const now = new Date();
  const year = Number(yearQ) || now.getFullYear();

  const [summary, settings] = await Promise.all([
    get1099Summary(ws.client.id, year),
    getFinanceSettings(ws.client.id),
  ]);

  const p = settings.payoutProfile;
  const recipient =
    p.businessType === "company" && p.legalName
      ? p.legalName
      : [p.firstName, p.lastName].filter(Boolean).join(" ") || ws.client.businessName;
  const addrParts = [p.addressLine1, p.addressLine2, [p.city, p.state].filter(Boolean).join(", "), p.postalCode].filter(Boolean);

  return (
    <div>
      {/* Action bar (hidden when printing) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/client/invoices/reports`} className="text-sm text-stone-500 hover:underline">← Tax &amp; reports</Link>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      {/* The statement */}
      <article className="mx-auto mt-4 max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-card print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <p className="font-display text-2xl text-stone-900">1099-K Summary Statement</p>
            <p className="mt-0.5 text-sm text-stone-500">Tax year {year}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg text-stone-900">PageBee Pay</p>
            <p className="text-xs text-stone-500">Payment settlement entity</p>
          </div>
        </header>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Payee</p>
            <p className="mt-1 font-medium text-stone-900">{recipient}</p>
            {addrParts.map((line, i) => (
              <p key={i} className="text-sm text-stone-600">{line}</p>
            ))}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Gross payments (Box 1a)</p>
            <p className="mt-1 font-display text-3xl text-stone-900">{fmt(summary.gross)}</p>
            <p className="text-sm text-stone-500">{summary.count} card transaction{summary.count === 1 ? "" : "s"}</p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
              <th className="py-2">Month</th>
              <th className="py-2 text-right">Gross card payments</th>
            </tr>
          </thead>
          <tbody>
            {summary.monthly.map((m) => (
              <tr key={m.month} className="border-b border-stone-100">
                <td className="py-1.5 text-stone-700">{MONTHS[m.month - 1]}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-800">{fmt(m.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300 font-semibold">
              <td className="py-2 text-stone-900">Total (Box 1a)</td>
              <td className="py-2 text-right tabular-nums text-stone-900">{fmt(summary.gross)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-500 print:bg-transparent print:p-0">
          <p className="font-semibold text-stone-600">This is an informational summary — not the official IRS Form 1099-K.</p>
          <p className="mt-1">
            It reflects gross card payments processed through PageBee Pay for the tax year shown, for your records and your
            accountant's reference. Your official IRS Form 1099-K (if your volume crosses the reporting threshold) is filed
            with the IRS and delivered to you by PageBee Pay each January — no action is needed on your part. Figures are
            denominated in USD.
          </p>
        </div>
      </article>
    </div>
  );
}
