import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { processStripeEvent } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/webhooks/stripe — verify the signature, then process the event idempotently. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await req.text(); // raw body required for signature verification
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
  } catch (err) {
    console.error("[stripe webhook] processing error", err);
    return NextResponse.json({ error: "processing_error" }, { status: 500 }); // Stripe will retry
  }
  return NextResponse.json({ received: true });
}
