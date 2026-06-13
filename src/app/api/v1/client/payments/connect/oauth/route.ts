import { NextResponse } from "next/server";
import { completeOAuth } from "@/lib/modules/payments";
import { appBaseUrl } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/payments/connect/oauth — Stripe Connect (BYO) OAuth callback. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = appBaseUrl();
  if (!code || !state) return NextResponse.redirect(`${base}/client/invoices/settings?connect=error`);
  try {
    await completeOAuth(state, code);
    return NextResponse.redirect(`${base}/client/invoices/settings?connect=done`);
  } catch {
    return NextResponse.redirect(`${base}/client/invoices/settings?connect=error`);
  }
}
