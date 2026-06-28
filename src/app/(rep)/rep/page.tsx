import Link from "next/link";
import { CalendarClock, Users, TrendingUp, ArrowRight, Sparkles, CheckCircle2, Trophy } from "lucide-react";
import { getRepWorkspace, repFunnelStats, repMonthlyStanding, listFollowUps } from "@/lib/modules/sales";
import { usd, pct } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import { TrackView } from "@/components/ui/TrackView";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FUNNEL: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "preview_sent", label: "Preview sent" },
  { key: "quoted", label: "Quoted" },
  { key: "closed", label: "Closed" },
];

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const CARD = "rounded-2xl border border-stone-200/70 bg-white shadow-[var(--shadow-card)]";

export default async function RepDashboardPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;

  const now = new Date();
  const [stats, followUps, standing] = await Promise.all([
    repFunnelStats(ws.employee.id, now),
    listFollowUps(ws.employee.id),
    repMonthlyStanding(ws.employee.id, now),
  ]);
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const leaderPct = standing.leaderCloses > 0 ? Math.round((standing.closes / standing.leaderCloses) * 100) : 0;
  // With no closes yet, a rank (#1 of 1) is meaningless — show an honest kickoff state instead.
  const noCloses = standing.closes === 0;

  const firstName = ws.name.split(/[\s@]/)[0];
  const closed = stats.byStatus.closed ?? 0;
  const convRate = stats.totalProspects > 0 ? closed / stats.totalProspects : 0;
  const maxStage = Math.max(1, ...FUNNEL.map((s) => stats.byStatus[s.key] ?? 0));
  const outstanding = stats.earnings.eligible + stats.earnings.approved + stats.earnings.pending;
  const focus = followUps.slice(0, 5).map((f) => ({ ...f, overdue: f.dueAt.getTime() <= now.getTime() }));
  const overdueCount = followUps.filter((f) => f.dueAt.getTime() <= now.getTime()).length;

  return (
    <div className="pb-stagger space-y-8">
      <TrackView event="rep_dashboard_viewed" props={{ prospects: stats.totalProspects, overdue: overdueCount }} />

      {/* Greeting */}
      <div>
        <p className="text-sm font-medium text-amber-600">{greeting(now.getHours())}</p>
        <h1 className="font-display text-4xl tracking-tight text-stone-900">{firstName}.</h1>
        <p className="mt-1 text-sm text-stone-500">
          {overdueCount > 0
            ? `You have ${overdueCount} follow-up${overdueCount === 1 ? "" : "s"} due. Let's clear them.`
            : "You're all caught up. Time to find your next client."}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Prospects" value={String(stats.totalProspects)} accent="stone" href="/rep/prospects" />
        <Kpi icon={TrendingUp} label="Conversion" value={pct(convRate)} sub={`${closed} closed`} accent="emerald" />
        <Kpi icon={CalendarClock} label="Follow-ups due" value={String(stats.overdueFollowUps)} accent={stats.overdueFollowUps > 0 ? "amber" : "stone"} href="/rep/follow-ups" />
        <Kpi icon={Sparkles} label="Earnings" value={usd(stats.earnings.paid)} sub={`${usd(outstanding)} in the pipe`} accent="honey" href="/rep/earnings" />
      </div>

      {/* Monthly standing — motivation, anonymized */}
      <section className={cn(CARD, "overflow-hidden bg-gradient-to-br from-stone-900 to-stone-800 text-white")}>
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
              <Trophy size={22} />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{monthName} standing</p>
              <p className="font-display text-2xl">
                {noCloses ? "Let's get buzzing 🐝" : standing.rank === 1 ? "Leading the hive 🐝" : `Rank #${standing.rank}`}
                {!noCloses ? (
                  <span className="ml-2 text-sm font-normal text-stone-400">
                    of {standing.totalReps} rep{standing.totalReps === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="min-w-[200px] sm:text-right">
            <p className="text-sm text-stone-300">
              <span className="font-display text-2xl text-white">{standing.closes}</span> close{standing.closes === 1 ? "" : "s"} this month
            </p>
            {noCloses ? (
              <p className="mt-1 text-xs text-stone-400">Your first close this month puts you on the board.</p>
            ) : standing.rank === 1 ? (
              <p className="mt-1 text-xs text-amber-300">You&apos;re setting the pace. Keep it buzzing.</p>
            ) : (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${leaderPct}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  {standing.toLeader} more to catch #1
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Focus today */}
        <section className={cn(CARD, "p-6")}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-stone-900">Focus today</h2>
            <Link href="/rep/follow-ups" className="text-xs font-medium text-amber-700 hover:text-amber-800">
              All follow-ups →
            </Link>
          </div>
          {focus.length === 0 ? (
            <div className="mt-6 flex flex-col items-center py-6 text-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="mt-2 text-sm text-stone-500">No follow-ups scheduled. Add a prospect to get the ball rolling.</p>
              <Link href="/rep/prospects" className="mt-3 text-sm font-medium text-amber-700 hover:text-amber-800">
                Go to prospects →
              </Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {focus.map((f) => (
                <li key={f.id}>
                  <Link href={`/rep/prospects/${f.prospect.id}`} className="group flex items-center gap-3 py-3">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", f.overdue ? "bg-rose-500" : "bg-amber-400")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800 group-hover:text-amber-700">{f.prospect.businessName}</p>
                      {f.note ? <p className="truncate text-xs text-stone-400">{f.note}</p> : null}
                    </div>
                    <span className={cn("shrink-0 text-xs font-medium", f.overdue ? "text-rose-600" : "text-stone-400")}>
                      {f.overdue ? "Overdue" : f.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline funnel */}
        <section className={cn(CARD, "p-6")}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-stone-900">Pipeline</h2>
            <span className="text-xs text-stone-400">{stats.totalProspects} total</span>
          </div>
          <div className="mt-5 space-y-3">
            {FUNNEL.map((s) => {
              const count = stats.byStatus[s.key] ?? 0;
              const width = Math.max(count > 0 ? 8 : 2, (count / maxStage) * 100);
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-stone-500">{s.label}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-lg bg-stone-100">
                    <div
                      className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-amber-300 to-amber-500 px-2 text-xs font-semibold text-amber-950 transition-all"
                      style={{ width: `${width}%` }}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Earnings strip */}
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Paid to date</p>
            <p className="font-display text-3xl text-stone-900">{usd(stats.earnings.paid, { cents: true })}</p>
            <Link href="/rep/earnings" className="mt-1 inline-block text-xs font-medium text-amber-700 hover:text-amber-800">
              View full statement →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <Earn label="Pending" tip="Accrued — waiting on the client's first month + clawback window." value={usd(stats.earnings.pending)} />
            <Earn label="Eligible" tip="Cleared the clawback window; awaiting admin approval." value={usd(stats.earnings.eligible)} />
            <Earn label="Approved" tip="Approved and queued for payout via the hiring platform." value={usd(stats.earnings.approved)} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  href,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  accent: "stone" | "emerald" | "amber" | "honey";
  href?: string;
}) {
  const ring = {
    stone: "text-stone-400 bg-stone-100",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    honey: "text-amber-700 bg-amber-100",
  }[accent];
  const card = (
    <div className={cn(CARD, "group p-5 transition-shadow hover:shadow-[var(--shadow-card-hover)]")}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", ring)}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl text-stone-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-stone-400">{sub}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function Earn({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <div>
      <Tooltip label={tip}>
        <span className="cursor-help border-b border-dotted border-stone-300 text-xs font-medium uppercase tracking-wide text-stone-400">
          {label}
        </span>
      </Tooltip>
      <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}
