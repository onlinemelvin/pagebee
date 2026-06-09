import { getCurrentClient } from "@/lib/auth/session";
import { PLANS } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; tone: string; note: string }> = {
  ACTIVE: { label: "Active", tone: "bg-green-100 text-green-800", note: "Your account is active. We're preparing your website — we'll email you when the preview is ready." },
  SETUP_PENDING: { label: "Setup pending", tone: "bg-amber-100 text-amber-800", note: "Your account is created. Next: complete your one-time setup payment to start your build. (Payments coming soon.)" },
  TRIAL: { label: "Trial", tone: "bg-blue-100 text-blue-800", note: "You're on a trial." },
  PAST_DUE: { label: "Past due", tone: "bg-red-100 text-red-700", note: "A payment didn't go through. Please update your billing." },
  SUSPENDED: { label: "Suspended", tone: "bg-stone-200 text-stone-600", note: "Your account is suspended." },
  CANCELLED: { label: "Cancelled", tone: "bg-stone-200 text-stone-600", note: "Your subscription is cancelled." },
};

export default async function ClientHomePage() {
  const result = await getCurrentClient();
  if (!result) return null; // layout already redirects
  const { client } = result;
  const sub = client.subscription;
  const planDef = sub ? PLANS.find((p) => p.name === sub.plan.name) : undefined;
  const status = sub ? STATUS_COPY[sub.status] ?? { label: sub.status, tone: "bg-stone-100 text-stone-600", note: "" } : null;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Welcome, {client.ownerName ?? client.businessName}</h1>
      <p className="mt-1 text-stone-500">Here&apos;s your PageBee account.</p>

      {client.isTest && (
        <p className="mt-4 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
          Test account
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Plan card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Your plan</p>
          <p className="mt-1 font-display text-2xl text-stone-900">{planDef?.label ?? sub?.plan.name ?? "—"}</p>
          {sub && (
            <p className="mt-1 text-sm text-stone-500">
              {formatUsd(sub.agreedMonthlyFee)}/mo · {formatUsd(sub.agreedSetupFee)} setup
            </p>
          )}
          {status && (
            <span className={`mt-4 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>
              {status.label}
            </span>
          )}
        </div>

        {/* Business card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Business</p>
          <p className="mt-1 font-display text-2xl text-stone-900">{client.businessName}</p>
          <p className="mt-1 text-sm text-stone-500">{client.businessType ?? "—"}</p>
          <p className="mt-3 text-sm text-stone-500">{client.ownerEmail}</p>
        </div>
      </div>

      {status?.note && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-sm font-semibold text-stone-900">Next steps</p>
          <p className="mt-1 text-sm text-stone-600">{status.note}</p>
        </div>
      )}
    </div>
  );
}
