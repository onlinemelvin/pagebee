import Link from "next/link";
import { Crown, CreditCard, RefreshCw, Rocket, FileText, Users, Sparkles, Wand2 } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { prisma } from "@/lib/db";
import { planByName, planLimitRows, PLANS, PRICING_NOTE } from "@/lib/plans";
import { SectionCard } from "@/components/client/ui/SectionCard";
import { PlanComparison } from "@/components/client/PlanComparison";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LIVE: "Live — your site is published",
  SETUP_FEE_PENDING: "Approved — setup fee due to launch",
  APPROVED: "Approved — setup fee due to launch",
  PREVIEW_READY: "Free preview ready to review",
  EXPIRED: "Preview expired",
  NONE: "No website yet",
};
const STATUS_TONE: Record<string, string> = {
  LIVE: "bg-green-100 text-green-800",
  SETUP_FEE_PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-amber-100 text-amber-800",
  PREVIEW_READY: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-rose-100 text-rose-700",
  NONE: "bg-stone-100 text-stone-600",
};

function UsageTile({ icon: Icon, label, used, limit, unlimited, accent }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; used: number; limit: number; unlimited?: boolean; accent: string;
}) {
  const pct = unlimited ? Math.min(100, Math.round((used / Math.max(limit, 1)) * 100)) : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent}`}><Icon size={15} /></span>
        {label}
      </div>
      <p className="mt-2 font-display text-2xl text-stone-900">
        {used}
        <span className="text-sm font-normal text-stone-400"> / {unlimited ? "∞" : limit}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {unlimited && <p className="mt-1 text-[11px] text-stone-400">Unlimited (fair use)</p>}
    </div>
  );
}

export default async function ClientBillingPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  const plan = planByName(ws.planName) ?? PLANS[0];
  const awaiting = ws.preview.awaitingPayment;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [invoicesThisMonth, memberCount, inviteCount] = await Promise.all([
    plan.quotas.invoices !== undefined
      ? prisma.invoice.count({ where: { clientId: ws.client.id, docType: "INVOICE", createdAt: { gte: monthStart } } })
      : Promise.resolve(0),
    prisma.clientUser.count({ where: { clientId: ws.client.id } }),
    prisma.clientUserInvite.count({ where: { clientId: ws.client.id, status: "pending", expiresAt: { gt: now } } }),
  ]);
  const seatsUsed = memberCount + inviteCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Billing &amp; plan</h1>
        <p className="mt-1 text-stone-500">Your plan, usage, and payment method.</p>
      </div>

      {/* Current plan + usage */}
      <SectionCard className="anim-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-sm"><Crown size={24} /></span>
            <div>
              <p className="font-display text-2xl text-stone-900">{plan.label} plan</p>
              <p className="text-sm text-stone-500">{STATUS_LABEL[ws.preview.status] ?? ws.preview.status} · ${Math.round(plan.monthlyFee / 100)}/mo</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[ws.preview.status] ?? "bg-stone-100 text-stone-600"}`}>
            {ws.preview.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UsageTile icon={Wand2} label="Website updates" used={ws.quota.used} limit={ws.quota.allowance} unlimited={plan.quotas.updatesUnlimited} accent="bg-amber-100 text-amber-700" />
          <UsageTile icon={Users} label="Team seats" used={seatsUsed} limit={plan.quotas.seats} accent="bg-violet-100 text-violet-700" />
          {plan.quotas.invoices !== undefined && (
            <UsageTile icon={FileText} label="Invoices this month" used={invoicesThisMonth} limit={plan.quotas.invoices} unlimited={plan.quotas.invoicesUnlimited} accent="bg-emerald-100 text-emerald-700" />
          )}
        </div>

        {/* Included limits sneak-peek */}
        <div className="mt-5 rounded-xl bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">What&apos;s included</p>
          <div className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {planLimitRows(plan).map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-stone-500">{r.label}</span>
                <span className="font-semibold text-stone-800">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {ws.caps.teamSeats > 1 && (
          <Link href="/client/team" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-800">
            <Users size={15} /> Manage your team →
          </Link>
        )}
      </SectionCard>

      {/* Plan comparison / upgrade */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h2 className="font-display text-lg text-stone-900">Compare plans</h2>
        </div>
        <PlanComparison currentPlan={plan.name} />
        <p className="mt-3 text-xs text-stone-400">{PRICING_NOTE}</p>
      </div>

      {/* Payment / launch CTA */}
      <div className="anim-rise overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className={`grid h-14 w-14 place-items-center rounded-2xl ${awaiting ? "bg-amber-100 text-amber-600" : "bg-stone-100 text-stone-400"}`}>
            {awaiting ? <Rocket size={26} /> : <CreditCard size={26} />}
          </span>
          <p className="mt-4 font-display text-xl text-stone-900">
            {awaiting ? "Pay your setup fee to launch" : "Card payments are coming soon"}
          </p>
          <p className="mt-1 max-w-md text-sm text-stone-500">
            {awaiting
              ? "You approved your preview. Setup-fee checkout is connecting soon — once paid, your site launches, your domain connects, and your features turn on."
              : "We're connecting secure subscription billing. No charge until you approve your preview and choose to launch."}
          </p>
          {awaiting && (
            <Link href="/client" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
              <RefreshCw size={16} /> Continue from dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
