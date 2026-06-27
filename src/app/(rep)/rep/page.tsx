import Link from "next/link";
import { CalendarClock, Users, TrendingUp, DollarSign } from "lucide-react";
import { getRepWorkspace, repFunnelStats } from "@/lib/modules/sales";

export const dynamic = "force-dynamic";

const FUNNEL: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "preview_sent", label: "Preview sent" },
  { key: "quoted", label: "Quoted" },
  { key: "closed", label: "Closed" },
];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function RepDashboardPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;
  const stats = await repFunnelStats(ws.employee.id, new Date());

  const closed = stats.byStatus.closed ?? 0;
  const convRate = stats.totalProspects > 0 ? Math.round((closed / stats.totalProspects) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500">Your pipeline and earnings at a glance.</p>
      </div>

      {/* Headline cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Prospects" value={String(stats.totalProspects)} tone="stone" />
        <StatCard icon={TrendingUp} label="Conversion" value={`${convRate}%`} sub={`${closed} closed`} tone="emerald" />
        <StatCard
          icon={CalendarClock}
          label="Follow-ups due"
          value={String(stats.overdueFollowUps)}
          tone={stats.overdueFollowUps > 0 ? "amber" : "stone"}
          href="/rep/follow-ups"
        />
        <StatCard
          icon={DollarSign}
          label="Earnings (paid)"
          value={money(stats.earnings.paid)}
          sub={`${money(stats.earnings.eligible + stats.earnings.approved)} pending payout`}
          tone="emerald"
        />
      </div>

      {/* Funnel */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">Pipeline</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FUNNEL.map((s) => (
            <div key={s.key} className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-center">
              <p className="text-2xl font-semibold text-stone-900">{stats.byStatus[s.key] ?? 0}</p>
              <p className="mt-0.5 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Earnings breakdown */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">Commission</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <EarnRow label="Pending" value={money(stats.earnings.pending)} hint="awaiting first month + clawback" />
          <EarnRow label="Eligible" value={money(stats.earnings.eligible)} hint="cleared, awaiting approval" />
          <EarnRow label="Approved" value={money(stats.earnings.approved)} hint="queued for payout" />
          <EarnRow label="Paid" value={money(stats.earnings.paid)} hint="settled via Upwork/Fiverr" />
        </dl>
      </section>

      <Link href="/rep/prospects" className="inline-block text-sm font-medium text-amber-700 hover:text-amber-800">
        Go to prospects →
      </Link>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  tone: "stone" | "emerald" | "amber";
  href?: string;
}) {
  const toneCls = {
    stone: "text-stone-400",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
  }[tone];
  const card = (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
        <Icon size={16} className={toneCls} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-stone-400">{sub}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function EarnRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-stone-900">{value}</dd>
      <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>
    </div>
  );
}
