import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { completeOAuth, verifyConnectState } from "@/lib/modules/payments";
import { appBaseUrl } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/client/payments/connect/oauth — Stripe Connect (BYO) OAuth callback.
 * The connected account is attached to the AUTHENTICATED session client, and the signed `state`
 * must match that client — so a forged callback can't divert another tenant's payments.
 */
export async function GET(req: Request) {
  const base = appBaseUrl();
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.redirect(`${base}/login`);
    throw err;
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyConnectState(state, client.id)) {
    return NextResponse.redirect(`${base}/client/invoices/settings?connect=error`);
  }

  try {
    await completeOAuth(client.id, code);
    return NextResponse.redirect(`${base}/client/invoices/settings?connect=done`);
  } catch {
    return NextResponse.redirect(`${base}/client/invoices/settings?connect=error`);
  }
}
