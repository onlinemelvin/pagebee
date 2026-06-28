import { TrendingUp, Percent } from "lucide-react";
import type { RepPerformance, DiscountImpact } from "@/lib/modules/sales";
import { usd, pct } from "@/lib/format";

const money = usd;

/** Read-only sales analytics: per-rep performance table + discount-impact comparison. */
export function SalesAnalytics({ reps, discount }: { reps: RepPerformance[]; discount: DiscountImpact }) {
  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
        <TrendingUp size={16} /> Performance
      </h2>

      {/* Discount impact */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
          <Percent size={13} /> Discount impact on conversion
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Metric label="Discounted quotes" value={pct(discount.discounted.conversionRate)} sub={`${discount.discounted.conversions}/${discount.discounted.quotes} converted`} />
          <Metric label="Full-price quotes" value={pct(discount.fullPrice.conversionRate)} sub={`${discount.fullPrice.conversions}/${discount.fullPrice.quotes} converted`} />
          <Metric label="Setup given away" value={money(discount.totalSetupDiscount)} sub={`avg ${money(discount.avgSetupDiscount)}/quote`} />
        </div>
      </div>

      {/* Per-rep table */}
      {reps.length === 0 ? (
        <p className="text-sm text-stone-400">No reps yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-5 py-3 font-medium">Rep</th>
                <th className="px-5 py-3 font-medium text-right">Prospects</th>
                <th className="px-5 py-3 font-medium text-right">Quotes</th>
                <th className="px-5 py-3 font-medium text-right">Conversions</th>
                <th className="px-5 py-3 font-medium text-right">Conv. rate</th>
                <th className="px-5 py-3 font-medium text-right">Setup rev.</th>
                <th className="px-5 py-3 font-medium text-right">MRR sourced</th>
                <th className="px-5 py-3 font-medium text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {reps.map((r) => (
                <tr key={r.repId}>
                  <td className="px-5 py-3 font-medium text-stone-900">{r.repName}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{r.prospects}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{r.quotesSent}/{r.quotes}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{r.conversions}</td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-700">{pct(r.conversionRate)}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{money(r.setupRevenue)}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{money(r.monthlyRevenue)}</td>
                  <td className="px-5 py-3 text-right text-stone-700">
                    {money(r.commissionPaid)} <span className="text-xs text-stone-400">paid</span>
                    {r.commissionOutstanding > 0 ? (
                      <span className="block text-xs text-amber-600">{money(r.commissionOutstanding)} due</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-stone-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>
    </div>
  );
}
