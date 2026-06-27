import { DollarSign } from "lucide-react";
import { getRepWorkspace, repCommissionStatement } from "@/lib/modules/sales";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-stone-100 text-stone-600",
  ELIGIBLE: "bg-sky-100 text-sky-700",
  APPROVED: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CLAWED_BACK: "bg-rose-100 text-rose-700",
};

export default async function RepEarningsPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;
  const { totals, records } = await repCommissionStatement(ws.employee.id);

  const cards: { label: string; value: number; hint: string }[] = [
    { label: "Pending", value: totals.pending, hint: "awaiting first month + clawback" },
    { label: "Eligible", value: totals.eligible, hint: "cleared, awaiting approval" },
    { label: "Approved", value: totals.approved, hint: "queued for payout" },
    { label: "Paid", value: totals.paid, hint: "settled" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Earnings</h1>
        <p className="mt-1 text-sm text-stone-500">Your commission statement across every converted client.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{money(c.value)}</p>
            <p className="mt-0.5 text-[11px] text-stone-400">{c.hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">Statement</h2>
        {records.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">No commissions yet. Convert a client to start earning.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {records.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="flex-1 text-stone-700">
                  {r.clientName ?? "—"} <span className="text-stone-400">· {r.basis.replace("_", " ")}</span>
                </span>
                <span className="text-stone-500">on {money(r.collectedRevenue)}</span>
                <span className="font-semibold text-stone-900">{money(r.amount)}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLES[r.status] ?? STATUS_STYLES.PENDING)}>
                  {r.status.replace("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-xs text-stone-400">
        <DollarSign size={12} /> Commissions are paid out via the hiring platform once approved.
      </p>
    </div>
  );
}
