import { getClientWorkspace } from "@/lib/modules/client";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LIVE: "Live — your site is published",
  SETUP_FEE_PENDING: "Approved — setup fee due to launch",
  APPROVED: "Approved — setup fee due to launch",
  PREVIEW_READY: "Free preview ready to review",
  EXPIRED: "Preview expired",
  NONE: "No website yet",
};

export default async function ClientBillingPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  const awaiting = ws.preview.awaitingPayment;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Billing</h1>
      <p className="mt-1 text-stone-500">Your plan and payment method.</p>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-stone-900">{ws.planName} plan</p>
            <p className="text-sm text-stone-500">{STATUS_LABEL[ws.preview.status] ?? ws.preview.status}</p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {ws.preview.status}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-10 text-center">
        <p className="font-medium text-stone-900">
          {awaiting ? "Pay your setup fee to launch" : "Card payments are coming soon"}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {awaiting
            ? "You approved your preview. Setup-fee checkout is connecting soon — once paid, your site launches, your domain connects, and your features turn on."
            : "We're connecting secure payments. No charge until you approve your preview and choose to launch."}
        </p>
      </div>
    </div>
  );
}
