import { TrendingUp, CheckCircle2, Users, Tag } from "lucide-react";
import { fmt } from "./money-format";
import type { FinanceAnalytics } from "@/lib/modules/finance";

interface Aging {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
}

/** Owner analytics: revenue trend, quote acceptance, AR aging, top customers/items. Pure CSS charts —
 *  no charting dependency, print-friendly, and readable for non-technical owners. */
export function FinanceAnalytics({ data, aging }: { data: FinanceAnalytics; aging: Aging }) {
  const maxMonth = Math.max(1, ...data.revenueByMonth.map((m) => Math.max(m.collected, m.invoiced)));
  const agingRows = [
    { label: "Current", v: aging.current, tone: "bg-green-400" },
    { label: "1–30d", v: aging.d1_30, tone: "bg-amber-400" },
    { label: "31–60d", v: aging.d31_60, tone: "bg-orange-400" },
    { label: "61–90d", v: aging.d61_90, tone: "bg-red-400" },
    { label: "90d+", v: aging.d90, tone: "bg-red-600" },
  ];
  const maxAging = Math.max(1, ...agingRows.map((r) => r.v));

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-stone-500" />
        <h2 className="font-display text-lg text-stone-900">Business analysis</h2>
      </div>

      {/* Revenue trend */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-700">Revenue · last 12 months</p>
          <p className="text-sm text-stone-400">{fmt(data.collected12mo)} collected</p>
        </div>
        <div className="mt-3 flex items-end gap-1.5" style={{ height: 140 }}>
          {data.revenueByMonth.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${fmt(m.collected)} collected · ${fmt(m.invoiced)} invoiced`}>
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 110 }}>
                <div className="w-1/2 rounded-t bg-stone-200" style={{ height: `${Math.round((m.invoiced / maxMonth) * 100)}%` }} />
                <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${Math.round((m.collected / maxMonth) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-stone-400">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-400" /> Collected</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-stone-200" /> Invoiced</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Quote acceptance */}
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700"><CheckCircle2 size={14} className="text-stone-400" /> Quote &amp; estimate acceptance</p>
          {data.quote.sent === 0 ? (
            <p className="mt-2 text-sm text-stone-400">No estimates or quotes sent yet.</p>
          ) : (
            <>
              <p className="mt-2 font-display text-3xl text-stone-900">{data.quote.acceptanceRate}%<span className="ml-2 text-sm font-sans text-stone-400">accepted</span></p>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div className="bg-green-400" style={{ width: `${(data.quote.accepted / data.quote.sent) * 100}%` }} />
                <div className="bg-red-300" style={{ width: `${(data.quote.declined / data.quote.sent) * 100}%` }} />
                <div className="bg-stone-300" style={{ width: `${(data.quote.pending / data.quote.sent) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-stone-500">{data.quote.accepted} accepted · {data.quote.declined} declined · {data.quote.pending} awaiting · {data.quote.sent} sent</p>
            </>
          )}
        </div>

        {/* AR aging */}
        <div>
          <p className="text-sm font-medium text-stone-700">Outstanding by age</p>
          <div className="mt-3 space-y-1.5">
            {agingRows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-stone-500">{r.label}</span>
                <div className="h-3 flex-1 rounded bg-stone-100">
                  <div className={`h-3 rounded ${r.tone}`} style={{ width: `${Math.round((r.v / maxAging) * 100)}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-stone-600">{fmt(r.v)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top customers */}
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700"><Users size={14} className="text-stone-400" /> Top customers</p>
          {data.topCustomers.length === 0 ? (
            <p className="mt-2 text-sm text-stone-400">No collected revenue yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.topCustomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-stone-700">{c.name}</span>
                  <span className="shrink-0 font-medium text-stone-800">{fmt(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top items */}
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700"><Tag size={14} className="text-stone-400" /> Top items</p>
          {data.topItems.length === 0 ? (
            <p className="mt-2 text-sm text-stone-400">No paid line items yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.topItems.map((it) => (
                <li key={it.description} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-stone-700">{it.description}</span>
                  <span className="shrink-0 font-medium text-stone-800">{fmt(it.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
