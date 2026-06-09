import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";

export const dynamic = "force-dynamic";

export default async function ClientInvoicesPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  // Only reachable when the plan allows invoices AND the client opted in.
  if (!(ws.caps.invoices && ws.choices.invoices)) redirect("/client");

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Invoices</h1>
      <p className="mt-1 text-stone-500">Send invoices and collect payments from your customers.</p>
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-10 text-center">
        <p className="font-medium text-stone-900">Invoicing &amp; payments are coming soon</p>
        <p className="mt-1 text-sm text-stone-500">
          We&apos;ll switch this on for your account once payment processing is connected.
        </p>
      </div>
    </div>
  );
}
