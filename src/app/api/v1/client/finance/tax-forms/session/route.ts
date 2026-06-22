import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { createTaxDocumentsSession, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/finance/tax-forms/session — mint an Account Session for the embedded Connect
 * Documents component, which renders the connected account's official Stripe-issued tax forms
 * (1099-K). Owner-only: these forms carry the owner's tax ID. The client secret is short-lived and
 * never cached.
 */
export async function POST() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    const session = await createTaxDocumentsSession(client.id);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /client/finance/tax-forms/session]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
