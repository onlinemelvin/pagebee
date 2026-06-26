import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { listBillingInvoices } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — PageBee billing history (invoices/receipts) for this client. Owner-only. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const invoices = await listBillingInvoices(client.id).catch(() => []);
  return NextResponse.json({ invoices });
}
