import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientWorkspace } from "@/lib/modules/client";
import { getFinanceSettings, listTaxRates } from "@/lib/modules/finance";
import { getPaymentStatus, refreshAccountStatus, getTaxStatus } from "@/lib/modules/payments";
import { FinanceSettings } from "@/components/client/finance/FinanceSettings";
import { PaymentsConnect } from "@/components/client/finance/PaymentsConnect";
import { TaxSettings } from "@/components/client/finance/TaxSettings";

export const dynamic = "force-dynamic";

export default async function FinanceSettingsPage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");

  const { connect } = await searchParams;
  // Returning from Stripe onboarding — pull the latest account flags before rendering.
  if (connect === "done") await refreshAccountStatus(ws.client.id).catch(() => {});

  const [settings, taxRates, payStatus, taxStatus] = await Promise.all([
    getFinanceSettings(ws.client.id),
    listTaxRates(ws.client.id),
    getPaymentStatus(ws.client.id),
    getTaxStatus(ws.client.id),
  ]);

  return (
    <div>
      <Link href="/client/invoices" className="text-sm text-stone-500 hover:underline">← Finance</Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Finance settings</h1>
      <p className="mt-1 text-stone-500">Connect payments, set tax rates, numbering, defaults, and your business details.</p>
      <div className="mt-6 space-y-6">
        <PaymentsConnect status={payStatus} notice={connect ?? null} />
        <TaxSettings status={taxStatus} />
      </div>
      <FinanceSettings initialSettings={settings} initialTaxRates={taxRates} taxMode={settings.taxMode} />
    </div>
  );
}
