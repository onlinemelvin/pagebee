import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { processBillingEvent } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/webhooks/stripe-billing — PageBee subscription billing events.
 *  Separate endpoint/secret from the Connect payments webhook. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe-billing webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await processBillingEvent(event);
  } catch (err) {
    console.error("[stripe-billing webhook] processing error", err);
    return NextResponse.json({ error: "processing_error" }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
