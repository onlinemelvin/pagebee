import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox, Globe, CheckCircle2, ArrowUpCircle, Loader2, AlertTriangle, ArrowRight, MessageSquare } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { listLeads } from "@/lib/modules/lead";
import { listReviewQueue, listGenerationActivity } from "@/lib/modules/website";
import { openChangeRequestCounts } from "@/lib/modules/review";
import { listUpgradeRequests } from "@/lib/modules/subscription";
import { StatCard } from "@/components/client/ui/StatCard";
import { SectionCard } from "@/components/client/ui/SectionCard";
import { EmptyState } from "@/components/client/ui/EmptyState";
import { DonutChart, DonutLegend, type DonutSegment } from "@/components/client/ui/DonutChart";

export const dynamic = "force-dynamic";

const LEAD_PIPELINE: { keys: string[]; label: string; color: string }[] = [
  { keys: ["NEW"], label: "New", color: "#f59e0b" },
  { keys: ["CONTACTED"], label: "Contacted", color: "#0ea5e9" },
  { keys: ["QUALIFIED", "BOOKED"], label: "Qualified", color: "#8b5cf6" },
  { keys: ["WON"], label: "Won", color: "#10b981" },
  { keys: ["LOST", "SPAM"], label: "Closed", color: "#a8a29e" },
];

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function AdminOverviewPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const [leads, queue, activity, upgrades] = await Promise.all([
    listLeads({}),
    listReviewQueue(),
    listGenerationActivity(),
    listUpgradeRequests(),
  ]);
  const counts = await openChangeRequestCounts(queue.map((v) => v.id));

  const needsReview = queue.filter((v) => !v.config?.adminReviewed);
  const released = queue.filter((v) => v.config?.adminReviewed);
  const inFlight = activity.filter((j) => j.status === "QUEUED" || j.status === "GENERATING");
  const failed = activity.filter((j) => j.status === "FAILED");
  const newLeads = leads.filter((l) => l.status === "NEW");

  const pipeline: DonutSegment[] = LEAD_PIPELINE.map((g) => ({
    label: g.label,
    color: g.color,
    value: leads.filter((l) => g.keys.includes(l.status)).length,
  })).filter((s) => s.value > 0);

  const recentLeads = [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-stone-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="mt-0.5 font-display text-3xl text-stone-900">{greeting} — here&apos;s the queue</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={0} icon={Globe} accent="amber" label="Needs review" value={needsReview.length} href="/admin/websites" />
        <StatCard index={1} icon={CheckCircle2} accent="sky" label="Awaiting client approval" value={released.length} href="/admin/websites" />
        <StatCard index={2} icon={Inbox} accent="violet" label="New leads" value={newLeads.length} href="/admin/leads?status=NEW" />
        <StatCard index={3} icon={ArrowUpCircle} accent="orange" label="Pending upgrades" value={upgrades.length} href="/admin/upgrade-requests" />
      </div>

      {/* Generation health */}
      {(inFlight.length > 0 || failed.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {inFlight.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Loader2 size={20} className="animate-spin text-amber-600" />
              <div><p className="font-semibold text-stone-900">{inFlight.length} site{inFlight.length === 1 ? "" : "s"} generating</p><p className="text-sm text-stone-600">Live progress on the Websites page.</p></div>
              <Link href="/admin/websites" className="ml-auto text-sm font-semibold text-amber-700 hover:text-amber-800">View →</Link>
            </div>
          )}
          {failed.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle size={20} className="text-rose-600" />
              <div><p className="font-semibold text-stone-900">{failed.length} generation{failed.length === 1 ? "" : "s"} failed</p><p className="text-sm text-stone-600">Retry from the Websites page.</p></div>
              <Link href="/admin/websites" className="ml-auto text-sm font-semibold text-rose-700 hover:text-rose-800">Fix →</Link>
            </div>
          )}
        </div>
      )}

      {/* Needs review + leads pipeline */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" icon={Globe} title="Needs review" subtitle={`${needsReview.length} awaiting`} action={<Link href="/admin/websites" className="text-sm font-semibold text-amber-700 hover:text-amber-800">Queue →</Link>}>
          {needsReview.length === 0 ? (
            <EmptyState compact icon={CheckCircle2} title="All clear" description="No drafts waiting for review right now." />
          ) : (
            <ul className="divide-y divide-stone-100">
              {needsReview.slice(0, 6).map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/websites/${v.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500"><Globe size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">{v.website.client.businessName}</span>
                      <span className="block text-xs text-stone-400">v{v.version} · {timeAgo(v.createdAt)}</span>
                    </span>
                    {counts[v.id] ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{counts[v.id]} open</span> : null}
                    <ArrowRight size={15} className="text-stone-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={Inbox} title="Lead pipeline" subtitle={`${leads.length} total`}>
          {pipeline.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="No leads yet" />
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart segments={pipeline} size={128} center={<div><p className="font-display text-2xl text-stone-900">{leads.length}</p><p className="text-[10px] uppercase tracking-wide text-stone-400">leads</p></div>} />
              <div className="flex-1"><DonutLegend segments={pipeline} /></div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent leads + pending upgrades */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" icon={MessageSquare} title="Recent leads" action={<Link href="/admin/leads" className="text-sm font-semibold text-amber-700 hover:text-amber-800">All leads →</Link>}>
          {recentLeads.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="No leads yet" description="Inquiries from every client site land here." />
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentLeads.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-500">{l.name.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-stone-900">{l.name}</span><span className="block truncate text-sm text-stone-500">{l.message || l.email}</span></span>
                  <span className="shrink-0 text-xs text-stone-400">{timeAgo(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={ArrowUpCircle} title="Pending upgrades" action={upgrades.length ? <Link href="/admin/upgrade-requests" className="text-sm font-semibold text-amber-700 hover:text-amber-800">Review →</Link> : undefined}>
          {upgrades.length === 0 ? (
            <EmptyState compact icon={CheckCircle2} title="Nothing pending" description="Real-account upgrade requests appear here." />
          ) : (
            <ul className="space-y-3">
              {upgrades.slice(0, 5).map((r) => (
                <li key={r.id} className="rounded-xl border border-stone-200 p-3">
                  <p className="truncate text-sm font-medium text-stone-900">{r.client.businessName}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{r.fromPlan} → <span className="font-semibold text-stone-700">{r.toPlan}</span> · {timeAgo(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
