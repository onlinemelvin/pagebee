import Link from "next/link";
import {
  Inbox, CalendarClock, Wallet, Globe, Users, RefreshCw, TrendingUp, ArrowRight,
  MessageSquare, CalendarCheck, Sparkles, AlertTriangle, ScrollText, ReceiptText,
} from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { listLeads } from "@/lib/modules/lead";
import { listBookings } from "@/lib/modules/booking";
import { getFinanceDashboard, get1099Summary, pastUninvoicedAppointments } from "@/lib/modules/finance";
import { AttentionPanel, type AttentionItem } from "@/components/client/ui/AttentionPanel";
import { SetupWizard } from "@/components/client/SetupWizard";
import { CreateSiteWelcome } from "@/components/client/CreateSiteWelcome";
import { PreviewPanel } from "@/components/client/PreviewPanel";
import { FeatureCards } from "@/components/client/FeatureCards";
import { StatCard } from "@/components/client/ui/StatCard";
import { SectionCard } from "@/components/client/ui/SectionCard";
import { EmptyState } from "@/components/client/ui/EmptyState";
import { BarChart } from "@/components/client/ui/BarChart";
import { DonutChart, DonutLegend, type DonutSegment } from "@/components/client/ui/DonutChart";
import { fmt } from "@/components/client/finance/money-format";

export const dynamic = "force-dynamic";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export default async function ClientHomePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  // Before the first preview exists there's no data to show — replace the whole dashboard with a
  // focused welcome screen that explains the product and drives them to create their site.
  if (!ws.website.exists) {
    const settingUp = ws.preview.status === "IN_REVIEW" || ws.preview.status === "PREVIEW_GENERATING";
    return (
      <CreateSiteWelcome
        ownerName={ws.client.ownerName ?? ws.client.businessName}
        businessName={ws.client.businessName}
        planName={ws.planName}
        isOwner={ws.role === "owner"}
        settingUp={settingUp}
        caps={ws.caps}
      />
    );
  }

  const hasFinance = ws.caps.invoices && ws.choices.invoices;
  const hasBooking = ws.caps.booking && ws.choices.booking;
  const year = new Date().getFullYear();
  const curMonth = new Date().getMonth();

  const [leads, bookings, finance, form1099, uninvoiced] = await Promise.all([
    listLeads({ clientId: ws.client.id }),
    hasBooking ? listBookings(ws.client.id) : Promise.resolve([]),
    hasFinance ? getFinanceDashboard(ws.client.id) : Promise.resolve(null),
    hasFinance ? get1099Summary(ws.client.id, year) : Promise.resolve(null),
    hasFinance && hasBooking ? pastUninvoicedAppointments(ws.client.id) : Promise.resolve(0),
  ]);

  // ── Last-6-months window ──
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, curMonth - 5 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: MONTH_ABBR[d.getMonth()] };
  });
  const revenueSpark = last6.map(({ m, y }) => (y === year && form1099 ? form1099.monthly[m]?.amount ?? 0 : 0));
  const leadsByMonth = last6.map(({ y, m }) => leads.filter((l) => l.createdAt.getFullYear() === y && l.createdAt.getMonth() === m).length);

  // Revenue trend pill (this vs last month, card payments)
  let revTrend: { dir: "up" | "down"; label: string } | undefined;
  if (form1099) {
    const cur = form1099.monthly[curMonth]?.amount ?? 0;
    const prev = form1099.monthly[curMonth - 1]?.amount ?? 0;
    if (prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      revTrend = { dir: pct >= 0 ? "up" : "down", label: `${Math.abs(pct)}%` };
    }
  }

  // ── Inquiry pipeline donut ──
  const pipeline: DonutSegment[] = LEAD_PIPELINE.map((g) => ({
    label: g.label,
    color: g.color,
    value: leads.filter((l) => g.keys.includes(l.status)).length,
  })).filter((s) => s.value > 0);

  // ── Recent inquiries + upcoming appointments ──
  const recentLeads = [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.startAt.getTime() >= now && b.status !== "CANCELLED")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 5);

  // ── "Needs your attention": the time-sensitive things to act on, surfaced up top ──
  const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
  const apptSoon = bookings.filter((b) => b.status !== "CANCELLED" && b.startAt.getTime() >= now && b.startAt.getTime() <= now + 86_400_000).length;
  const openQuotes = finance ? finance.counts.openQuotes + finance.counts.openEstimates : 0;
  // (The PreviewPanel below already surfaces preview-ready / setup-fee states, so they're not repeated here.)
  const attention: AttentionItem[] = [];
  if (ws.counts.newInquiries > 0) attention.push({ key: "inq", icon: Inbox, tone: "violet", text: `${plural(ws.counts.newInquiries, "new inquiry", "new inquiries")} to reply to`, href: "/client/inquiries", cta: "Open" });
  if (hasBooking && ws.counts.pendingAppointments > 0) attention.push({ key: "appt-req", icon: CalendarClock, tone: "teal", text: `${plural(ws.counts.pendingAppointments, "appointment request")} to confirm`, href: "/client/appointments", cta: "Review" });
  if (hasBooking && apptSoon > 0) attention.push({ key: "appt-soon", icon: CalendarCheck, tone: "teal", text: `${plural(apptSoon, "appointment")} in the next 24 hours`, href: "/client/appointments", cta: "View" });
  if (finance && finance.counts.overdue > 0) attention.push({ key: "overdue", icon: AlertTriangle, tone: "red", text: `${plural(finance.counts.overdue, "overdue invoice")} — send a payment reminder`, href: "/client/invoices", cta: "Open" });
  if (openQuotes > 0) attention.push({ key: "quotes", icon: ScrollText, tone: "violet", text: `${plural(openQuotes, "quote/estimate")} awaiting your customer`, href: "/client/invoices", cta: "View" });
  if (uninvoiced > 0) attention.push({ key: "uninv", icon: ReceiptText, tone: "amber", text: `${plural(uninvoiced, "completed appointment")} ready to invoice`, href: "/client/invoices", cta: "Invoice" });

  const websiteStatus = ws.preview.live ? "Live" : ws.preview.ready ? "Preview ready" : ws.website.exists ? "In progress" : "Not started";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Greet by first name only. Staff are greeted by their own name; the owner by the account's owner
  // name (falling back to the business name when neither is set).
  const greetName = ws.role === "owner" ? ws.client.ownerName : ws.userName;
  const firstName = greetName?.trim().split(/\s+/)[0] || ws.client.businessName;
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-500">{dateStr}</p>
          <h1 className="mt-0.5 font-display text-3xl text-stone-900">
            {greeting}, {firstName}
          </h1>
        </div>
        {ws.client.isTest && (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">Test account</span>
        )}
      </div>

      {!ws.onboarding.complete && ws.role === "owner" && <SetupWizard steps={ws.onboarding.steps} />}

      <PreviewPanel preview={ws.preview} />

      <AttentionPanel items={attention} />

      {/* Stat cards (adaptive) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {hasFinance && finance ? (
          <>
            <StatCard index={0} icon={Wallet} accent="amber" label="Revenue this month" value={finance.thisMonthRevenue} cents prefix="$" trend={revTrend} spark={revenueSpark} />
            <StatCard index={1} icon={TrendingUp} accent="orange" label="Outstanding" value={finance.outstanding} cents prefix="$" href="/client/invoices" />
            <StatCard index={2} icon={Inbox} accent="violet" label="New inquiries" value={ws.counts.newInquiries} href="/client/inquiries" />
            {hasBooking ? (
              <StatCard index={3} icon={CalendarClock} accent="teal" label="Pending appointments" value={ws.counts.pendingAppointments} href="/client/appointments" />
            ) : (
              <StatCard index={3} icon={Globe} accent="sky" label="Website" display={websiteStatus} href="/client/website" />
            )}
          </>
        ) : (
          <>
            <StatCard index={0} icon={Inbox} accent="violet" label="New inquiries" value={ws.counts.newInquiries} href="/client/inquiries" spark={leadsByMonth} />
            <StatCard index={1} icon={Users} accent="amber" label="Total inquiries" value={leads.length} href="/client/inquiries" />
            {hasBooking ? (
              <StatCard index={2} icon={CalendarClock} accent="teal" label="Pending appointments" value={ws.counts.pendingAppointments} href="/client/appointments" />
            ) : (
              <StatCard index={2} icon={RefreshCw} accent="orange" label="Updates left" value={ws.quota.remaining} suffix={`/${ws.quota.allowance}`} href="/client/billing" />
            )}
            <StatCard index={3} icon={Globe} accent="sky" label="Website" display={websiteStatus} href="/client/website" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2 anim-rise"
          icon={hasFinance ? Wallet : TrendingUp}
          title={hasFinance ? "Online payments" : "Inquiries"}
          subtitle="Last 6 months"
          action={
            hasFinance ? (
              <Link href="/client/invoices/reports" className="text-sm font-semibold text-amber-700 hover:text-amber-800">Reports →</Link>
            ) : (
              <Link href="/client/inquiries" className="text-sm font-semibold text-amber-700 hover:text-amber-800">View all →</Link>
            )
          }
        >
          {hasFinance ? (
            <BarChart categories={last6.map((m) => m.label)} series={[{ name: "Card payments", color: "#f59e0b", values: revenueSpark }]} money height={210} />
          ) : (
            <BarChart categories={last6.map((m) => m.label)} series={[{ name: "Inquiries", color: "#f59e0b", values: leadsByMonth }]} height={210} />
          )}
        </SectionCard>

        <SectionCard className="anim-rise" style={{ "--d": "80ms" } as React.CSSProperties} icon={Inbox} title="Inquiry pipeline" subtitle={`${leads.length} total`}>
          {pipeline.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="No inquiries yet" description="Leads from your website land here." />
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart
                segments={pipeline}
                size={132}
                center={
                  <div>
                    <p className="font-display text-2xl text-stone-900">{leads.length}</p>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">leads</p>
                  </div>
                }
              />
              <div className="flex-1"><DonutLegend segments={pipeline} /></div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent inquiries + upcoming / actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          icon={MessageSquare}
          title="Recent inquiries"
          action={<Link href="/client/inquiries" className="text-sm font-semibold text-amber-700 hover:text-amber-800">All inquiries →</Link>}
        >
          {recentLeads.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="No inquiries yet" description="When visitors contact you through your site, they'll appear here." cta={{ label: "Preview your site", href: "/client/website" }} />
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentLeads.map((l) => (
                <li key={l.id}>
                  <Link href="/client/inquiries" className="flex items-center gap-3 py-3 transition hover:opacity-80">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-500">
                      {l.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-stone-900">{l.name}</span>
                        {l.status === "NEW" && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">New</span>}
                      </span>
                      <span className="block truncate text-sm text-stone-500">{l.message || l.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-stone-400">{timeAgo(l.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {hasBooking ? (
          <SectionCard icon={CalendarCheck} title="Upcoming" action={<Link href="/client/appointments" className="text-sm font-semibold text-amber-700 hover:text-amber-800">Calendar →</Link>}>
            {upcoming.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="Nothing scheduled" description="Confirmed appointments show up here." cta={{ label: "Open calendar", href: "/client/appointments" }} />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-center leading-none text-teal-700">
                      <span className="text-xs font-bold">{b.startAt.getDate()}</span>
                      <span className="text-[9px] uppercase">{MONTH_ABBR[b.startAt.getMonth()]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-900">{b.serviceName}</span>
                      <span className="block truncate text-xs text-stone-500">{b.customer?.name ?? "Walk-in"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-stone-400">
                      {b.startAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        ) : (
          <SectionCard icon={Sparkles} title="Quick actions">
            <ul className="space-y-2">
              {[
                { label: "Edit your services", href: "/client/services", icon: Sparkles },
                { label: "Customize your website", href: "/client/website", icon: Globe },
                { label: "Upload photos", href: "/client/media", icon: Inbox },
              ].map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-700 transition hover:border-amber-300 hover:bg-amber-50">
                    <a.icon size={16} className="text-amber-500" />
                    <span className="flex-1">{a.label}</span>
                    <ArrowRight size={15} className="text-stone-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {ws.website.exists && <FeatureCards features={ws.features} title="Add features" />}
    </div>
  );
}
