import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, CreditCard, Rocket, FileText, Users, Sparkles, Wand2, Bot, MessageSquare, Mail } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getMonthlyUsage } from "@/lib/modules/usage";
import { prisma } from "@/lib/db";
import { planByName, planLimitRows, PLANS, PRICING_NOTE } from "@/lib/plans";
import { SectionCard } from "@/components/client/ui/SectionCard";
import { PlanComparison } from "@/components/client/PlanComparison";
import { reconcileFromStripe, retentionOfferAvailable } from "@/lib/modules/billing";
import { CheckoutButton, CancelPlanButton, CheckoutStatusBanner } from "@/components/client/BillingActions";
import { PaymentMethodCard } from "@/components/client/PaymentMethodCard";
import { BillingHistory } from "@/components/client/BillingHistory";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LIVE: "Live — your site is published",
  SETUP_FEE_PENDING: "Approved — setup fee due to launch",
  APPROVED: "Approved — setup fee due to launch",
  PREVIEW_READY: "Free preview ready to review",
  NONE: "No website yet",
};
const STATUS_TONE: Record<string, string> = {
  LIVE: "bg-green-100 text-green-800",
  SETUP_FEE_PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-amber-100 text-amber-800",
  PREVIEW_READY: "bg-amber-100 text-amber-800",
  NONE: "bg-stone-100 text-stone-600",
};

function UsageTile({ icon: Icon, label, used, limit, unlimited, accent }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; used: number; limit: number; unlimited?: boolean; accent: string;
}) {
  const pct = unlimited ? Math.min(100, Math.round((used / Math.max(limit, 1)) * 100)) : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-card">
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

export default async function ClientBillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (ws.role !== "owner") redirect("/client"); // billing & plan are owner-only

  const { checkout, session_id } = await searchParams;

  // Self-heal from Stripe so a missed/delayed webhook can't leave the plan, launch, or a duplicate
  // subscription out of sync. When we have a session id on the success return, CheckoutStatusBanner
  // handles it (polls the reconcile endpoint + shows progress), so skip the server pass to keep that
  // UX; otherwise reconcile here.
  if (!(checkout === "success" && session_id)) {
    const sub0 = await prisma.subscription.findUnique({ where: { clientId: ws.client.id }, select: { stripeCustomerId: true } });
    if (sub0?.stripeCustomerId) {
      const { changed } = await reconcileFromStripe(ws.client.id).catch(() => ({ changed: false }));
      if (changed) redirect("/client/billing"); // re-render with fresh (cached) workspace
    }
  }

  const plan = planByName(ws.planName) ?? PLANS[0];
  const awaiting = ws.preview.awaitingPayment;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [invoicesThisMonth, memberCount, inviteCount, aiUsed, smsUsed, emailUsed, subRow] = await Promise.all([
    plan.quotas.invoices !== undefined
      ? prisma.invoice.count({ where: { clientId: ws.client.id, docType: "INVOICE", createdAt: { gte: monthStart } } })
      : Promise.resolve(0),
    prisma.clientUser.count({ where: { clientId: ws.client.id } }),
    prisma.clientUserInvite.count({ where: { clientId: ws.client.id, status: "pending", expiresAt: { gt: now } } }),
    plan.quotas.aiReplies ? getMonthlyUsage(ws.client.id, "aiReplies") : Promise.resolve(0),
    plan.quotas.sms ? getMonthlyUsage(ws.client.id, "sms") : Promise.resolve(0),
    plan.quotas.email ? getMonthlyUsage(ws.client.id, "email") : Promise.resolve(0),
    prisma.subscription.findUnique({ where: { clientId: ws.client.id }, select: { stripeSubscriptionId: true, stripeCustomerId: true, cancelAt: true, currentPeriodEnd: true, pendingPlan: true } }),
  ]);
  const seatsUsed = memberCount + inviteCount;
  // A live subscription the owner can cancel (or un-cancel if already scheduled).
  const hasActiveSub = Boolean(subRow?.stripeSubscriptionId) && ws.preview.live;
  const hasBilling = Boolean(subRow?.stripeCustomerId);
  const cancelScheduled = Boolean(subRow?.cancelAt);
  const accessUntil = (subRow?.cancelAt ?? subRow?.currentPeriodEnd)?.toLocaleDateString("en-US", { dateStyle: "long" }) ?? null;
  const retentionAvail = hasActiveSub ? await retentionOfferAvailable(ws.client.id) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Billing &amp; plan</h1>
        <p className="mt-1 text-stone-500">Your plan, usage, and payment method.</p>
      </div>

      {checkout === "success" && <CheckoutStatusBanner sessionId={session_id} />}
      {checkout === "cancel" && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Checkout canceled — no charge was made. You can pick up where you left off anytime.
        </div>
      )}

      {/* Current plan + usage */}
      <SectionCard className="anim-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-sm"><Crown size={24} /></span>
            <div>
              <p className="font-display text-2xl text-stone-900">{plan.label} plan</p>
              <p className="text-xs font-medium text-amber-700">{plan.subtitle}</p>
              <p className="text-sm text-stone-500">{STATUS_LABEL[ws.preview.status] ?? ws.preview.status} · ${Math.round(plan.monthlyFee / 100)}/mo</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[ws.preview.status] ?? "bg-stone-100 text-stone-600"}`}>
            {ws.preview.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UsageTile icon={Wand2} label="Website updates" used={ws.quota.used} limit={ws.quota.allowance} unlimited={plan.quotas.updatesUnlimited} accent="bg-amber-100 text-amber-700" />
          <UsageTile icon={Users} label="Team seats" used={seatsUsed} limit={plan.quotas.seats} unlimited={plan.quotas.seatsUnlimited} accent="bg-violet-100 text-violet-700" />
          {plan.quotas.invoices !== undefined && (
            <UsageTile icon={FileText} label="Invoices this month" used={invoicesThisMonth} limit={plan.quotas.invoices} unlimited={plan.quotas.invoicesUnlimited} accent="bg-emerald-100 text-emerald-700" />
          )}
          {plan.quotas.aiReplies !== undefined && (
            <UsageTile icon={Bot} label="AI replies this month" used={aiUsed} limit={plan.quotas.aiReplies} accent="bg-sky-100 text-sky-700" />
          )}
          {plan.quotas.sms !== undefined && (
            <UsageTile icon={MessageSquare} label="SMS this month" used={smsUsed} limit={plan.quotas.sms} accent="bg-rose-100 text-rose-700" />
          )}
          {plan.quotas.email !== undefined && (
            <UsageTile icon={Mail} label="Emails this month" used={emailUsed} limit={plan.quotas.email} accent="bg-orange-100 text-orange-700" />
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
        <PlanComparison currentPlan={plan.name} mode={ws.preview.live ? "manage" : "select"} pendingPlan={subRow?.pendingPlan} />
        <p className="mt-3 text-xs text-stone-400">{PRICING_NOTE}</p>
      </div>

      {/* Saved card + billing history (once a billing customer exists) */}
      {hasBilling && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PaymentMethodCard />
          <BillingHistory />
        </div>
      )}

      {/* Payment / launch CTA */}
      <div className="anim-rise overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className={`grid h-14 w-14 place-items-center rounded-2xl ${awaiting ? "bg-amber-100 text-amber-600" : "bg-stone-100 text-stone-400"}`}>
            {awaiting ? <Rocket size={26} /> : <CreditCard size={26} />}
          </span>
          <p className="mt-4 font-display text-xl text-stone-900">
            {awaiting ? "Pay your setup fee to launch" : ws.preview.live ? "Your plan is active" : "Secure card payments"}
          </p>
          <p className="mt-1 max-w-md text-sm text-stone-500">
            {awaiting
              ? `You approved your preview. Pay the one-time setup fee ($${Math.round(plan.setupFee / 100)}) and your first month ($${Math.round(plan.monthlyFee / 100)}/mo) to launch — your site goes live, your domain connects, and your features turn on.`
              : ws.preview.live
                ? `Your ${plan.label ?? plan.name} subscription is active, billed securely by card each month. We'll email a receipt every time.`
                : "Secure card billing by Stripe. No charge until you approve your preview and choose to launch."}
          </p>
          {awaiting && (
            <div className="mt-5">
              <CheckoutButton kind="setup" label="Pay setup fee &amp; launch" />
            </div>
          )}
          {hasActiveSub && (
            <div className="mt-6 w-full max-w-md border-t border-stone-100 pt-5">
              <CancelPlanButton
                cancelScheduled={cancelScheduled}
                accessUntil={accessUntil}
                retentionAvailable={retentionAvail}
                planLabel={plan.label}
                monthlyCents={plan.monthlyFee}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
