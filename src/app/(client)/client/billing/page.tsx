import Link from "next/link";
import { Crown, CreditCard, RefreshCw, Rocket, CheckCircle2 } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { SectionCard } from "@/components/client/ui/SectionCard";

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

export default async function ClientBillingPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  const awaiting = ws.preview.awaitingPayment;
  const pct = ws.quota.allowance > 0 ? Math.min(100, Math.round((ws.quota.used / ws.quota.allowance) * 100)) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Billing &amp; plan</h1>
      <p className="mt-1 text-stone-500">Your plan, usage, and payment method.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Plan card */}
        <SectionCard className="anim-rise lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-sm">
                <Crown size={24} />
              </span>
              <div>
                <p className="font-display text-2xl text-stone-900">{ws.planName} plan</p>
                <p className="text-sm text-stone-500">{STATUS_LABEL[ws.preview.status] ?? ws.preview.status}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[ws.preview.status] ?? "bg-stone-100 text-stone-600"}`}>
              {ws.preview.status.replace(/_/g, " ")}
            </span>
          </div>

          {ws.quota.allowance > 0 && (
            <div className="mt-6 rounded-xl bg-stone-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-stone-700">Monthly website updates</span>
                <span className="text-stone-500">{ws.quota.used} of {ws.quota.allowance} used</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-stone-400">{ws.quota.remaining} remaining this month · resets on the 1st.</p>
            </div>
          )}
        </SectionCard>

        {/* Upgrade nudge */}
        <SectionCard className="anim-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
          <p className="font-display text-lg text-stone-900">Need more room?</p>
          <p className="mt-1 text-sm text-stone-500">Higher tiers unlock more pages, more monthly updates, and advanced features.</p>
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            {["More pages", "More monthly updates", "Bookings, invoices & AI"].map((f) => (
              <li key={f} className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-500" /> {f}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Payment / launch CTA */}
      <div className="anim-rise mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white" style={{ "--d": "160ms" } as React.CSSProperties}>
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
              : "We're connecting secure payments. No charge until you approve your preview and choose to launch."}
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
