import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientWorkspace } from "@/lib/modules/client";
import { getFinanceSettings } from "@/lib/modules/finance";
import { getOnboardingState } from "@/lib/modules/payments";
import { PageBeePayOnboarding } from "@/components/client/finance/PageBeePayOnboarding";

export const dynamic = "force-dynamic";

export default async function PageBeePayPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");
  if (ws.role !== "owner") redirect("/client/invoices"); // payout onboarding is owner-only

  const [settings, state] = await Promise.all([getFinanceSettings(ws.client.id), getOnboardingState(ws.client.id)]);
  if (state.chargesEnabled) redirect("/client/invoices/settings?connect=done");

  return (
    <div>
      <Link href="/client/invoices/settings" className="text-sm text-stone-500 hover:underline">← Finance settings</Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">PageBee Pay</h1>
      <p className="mt-1 text-stone-500">Activate card payments — sophisticated, secure, fully managed by PageBee.</p>
      {!state.configured ? (
        <p className="mt-6 text-sm text-stone-600">PageBee Pay is being set up for your account — check back shortly.</p>
      ) : (
        <PageBeePayOnboarding settings={settings} state={state} />
      )}
    </div>
  );
}
