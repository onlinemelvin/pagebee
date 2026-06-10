import { getClientWorkspace } from "@/lib/modules/client";

export const dynamic = "force-dynamic";

export default async function ClientBillingPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Billing</h1>
      <p className="mt-1 text-stone-500">Manage your plan and payment method.</p>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-stone-900">{ws.planName} plan</p>
            <p className="text-sm text-stone-500">
              {ws.trial.status === "TRIAL"
                ? `Free trial — ${ws.trial.daysLeft ?? 0} day${ws.trial.daysLeft === 1 ? "" : "s"} left`
                : ws.trial.ended
                  ? "Trial ended — your site is paused"
                  : "Active"}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {ws.trial.status}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-10 text-center">
        <p className="font-medium text-stone-900">Card payments are coming soon</p>
        <p className="mt-1 text-sm text-stone-500">
          We&apos;re connecting secure payments. You&apos;ll be able to add a card here to keep your
          site live after your trial — no charge until you do.
        </p>
      </div>
    </div>
  );
}
