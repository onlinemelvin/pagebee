import { redirect } from "next/navigation";
import { Wand2, CheckCircle2, AlertTriangle, TimerReset, Gauge, Cloud } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { getGenerationAnalytics } from "@/lib/modules/website";
import { StatCard } from "@/components/client/ui/StatCard";
import { EmptyState } from "@/components/client/ui/EmptyState";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

/** "92s" → "1m 32s"; small values stay in seconds. */
function fmtSec(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export default async function AdminAnalyticsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const a = await getGenerationAnalytics(30);
  const maxDay = Math.max(1, ...a.daily.map((d) => d.completed + d.failed));

  return (
    <div>
      {a.inFlight > 0 && <AutoRefresh intervalMs={5000} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Generation analytics</h1>
          <p className="mt-1 text-sm text-stone-500">Website generation volume, speed, and reliability — last {a.windowDays} days.</p>
        </div>
        {a.inFlight > 0 && (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
            {a.inFlight} in progress
          </span>
        )}
      </div>

      {/* Headline metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard index={0} icon={Wand2} accent="amber" label="Total generations" value={a.total} />
        <StatCard
          index={1}
          icon={CheckCircle2}
          accent="emerald"
          label={a.successRatePct !== null ? `Completed · ${a.successRatePct}% success` : "Completed"}
          value={a.completed}
        />
        <StatCard index={2} icon={AlertTriangle} accent="rose" label="Failed" value={a.failed} />
        <StatCard
          index={3}
          icon={TimerReset}
          accent="rose"
          label="Edge timeouts (stuck)"
          value={a.stuck}
          hint="Offloaded generations that never returned a result — almost always cut off by the Supabase edge function's ~150s execution limit (or an edge crash)."
        />
        <StatCard
          index={4}
          icon={Gauge}
          accent="sky"
          label="Avg time to generate"
          display={a.duration ? fmtSec(a.duration.avgSec) : "—"}
        />
        <StatCard index={5} icon={Cloud} accent="violet" label="Ran via edge offload" value={a.offloadCount} />
      </div>

      {/* Duration breakdown */}
      {a.duration && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Generation time</h2>
          <p className="mt-1 text-xs text-stone-400">Start → finish for the {a.duration.count} completed generations in this window.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Average", v: a.duration.avgSec },
              { label: "Median (p50)", v: a.duration.p50Sec },
              { label: "p95", v: a.duration.p95Sec },
              { label: "Slowest", v: a.duration.maxSec },
            ].map((d) => (
              <div key={d.label} className="rounded-xl bg-stone-50 p-3">
                <p className="font-display text-2xl text-stone-900">{fmtSec(d.v)}</p>
                <p className="mt-0.5 text-xs text-stone-500">{d.label}</p>
              </div>
            ))}
          </div>
          {/* The edge function has a ~150s wall-clock cap on Supabase's free tier — flag if p95 is near it. */}
          {a.duration.p95Sec >= 120 && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              ⚠️ p95 is {fmtSec(a.duration.p95Sec)} — close to the ~150s edge limit. Consider trimming the HTML prompt or lowering max_tokens to avoid timeouts.
            </p>
          )}
        </div>
      )}

      {/* Daily trend */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Daily volume (last {a.daily.length} days)</h2>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
          {a.daily.map((d) => {
            const tot = d.completed + d.failed;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.completed} completed, ${d.failed} failed`}>
                <div className="flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(tot / maxDay) * 90}px` }}>
                  <div className="bg-emerald-400" style={{ height: `${tot ? (d.completed / tot) * 100 : 0}%` }} />
                  <div className="bg-rose-400" style={{ height: `${tot ? (d.failed / tot) * 100 : 0}%` }} />
                </div>
                <span className="text-[10px] text-stone-400">{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Failed</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Top failure reasons */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Top failure reasons</h2>
          {a.topErrors.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">No failures in this window. 🎉</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {a.topErrors.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-stone-50 p-2.5">
                  <span className="min-w-0 break-words font-mono text-[11px] text-stone-700">{e.error.slice(0, 160)}</span>
                  <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent failures */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Recent failures</h2>
          {a.recentFailures.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">Nothing failed recently.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {a.recentFailures.map((f) => (
                <li key={f.id} className="rounded-lg bg-stone-50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-800">{f.business ?? "—"}</span>
                    <span className="text-[11px] text-stone-400">{f.createdAt.toLocaleString()}</span>
                  </div>
                  {f.error && <p className="mt-1 break-words font-mono text-[11px] text-red-600">{f.error.slice(0, 200)}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {a.total === 0 && (
        <div className="mt-6">
          <EmptyState icon={Wand2} title="No generations yet" description="Generation metrics will appear here once clients start building sites." />
        </div>
      )}
    </div>
  );
}
