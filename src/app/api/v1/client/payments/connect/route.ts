import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { startConnect, PaymentError } from "@/lib/modules/payments";
import { appBaseUrl } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/client/payments/connect — "bring your own" (BYO) OAuth connect to an existing Stripe
 * account. The default white-label "PageBee Pay" path is the Custom-account onboarding page instead.
 */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.redirect(`${appBaseUrl()}/login`);
    throw err;
  }
  try {
    const url = await startConnect(client.id);
    return NextResponse.redirect(url);
  } catch (err) {
    const code = err instanceof PaymentError ? err.code : "error";
    return NextResponse.redirect(`${appBaseUrl()}/client/invoices/settings?connect=${code}`);
  }
}
