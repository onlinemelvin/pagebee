import { headers } from "next/headers";
import { getClientWorkspace } from "@/lib/modules/client";
import { getPaymentStatus } from "@/lib/modules/payments";
import { FinancePaymentGate } from "@/components/client/finance/FinancePaymentGate";

export const dynamic = "force-dynamic";

/**
 * Finance gate: enabling a payment method is the FIRST thing an owner must do — until a processor is
 * connected (PageBee Pay or bring-your-own Stripe), every Finance page is blocked and replaced by the
 * welcome/choose-a-processor screen. The only pages allowed through while unconnected are the ones
 * where you actually connect one (Settings + the PageBee Pay onboarding). Off-plan/staff fall through
 * to the pages' own gating.
 */
export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const ws = await getClientWorkspace();
  if (!ws || !ws.caps.invoices || ws.role !== "owner") return <>{children}</>;

  const status = await getPaymentStatus(ws.client.id);
  if (status.connected) return <>{children}</>; // a processor is set up → normal Finance

  // Not connected yet — allow only the connect destinations through so they can actually set one up.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const onConnectPage =
    pathname.startsWith("/client/invoices/settings") || pathname.startsWith("/client/invoices/payments");
  if (onConnectPage) return <>{children}</>;

  return <FinancePaymentGate configured={status.configured} />;
}
