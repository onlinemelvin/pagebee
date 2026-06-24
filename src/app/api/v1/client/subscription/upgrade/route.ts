import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { requestUpgrade, SubscriptionError } from "@/lib/modules/subscription";
import { upgradeSubscription, BillingError } from "@/lib/modules/billing";
import { stripeConfigured } from "@/lib/stripe/client";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/subscription/upgrade — upgrade to a higher tier. Test accounts apply
 * instantly; real accounts go through Stripe Checkout (or, if Stripe isn't configured, capture an
 * upgrade request for admin/sales). Body: { toPlan, reason? }.
 */
export async function POST(req: Request) {
  let client, ctx;
  try {
    // allowInactive: a suspended/cancelled tenant must still be able to upgrade to reactivate.
    ({ client, ctx } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = (await req.json().catch(() => null)) as { toPlan?: unknown; reason?: unknown } | null;
  const toPlan = typeof body?.toPlan === "string" ? body.toPlan : null;
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  if (!toPlan) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });

  try {
    // Real accounts with Stripe configured pay by card; existing subscribers upgrade IN PLACE
    // (prorated, no duplicate subscription) and apply instantly, while not-yet-subscribed accounts
    // are sent to Checkout to collect a payment method. Test accounts apply instantly, and without
    // Stripe we fall back to the admin upgrade request.
    if (!client.isTest && stripeConfigured()) {
      const result = await upgradeSubscription(client.id, toPlan);
      if ("url" in result) return NextResponse.json({ ok: true, checkoutUrl: result.url });
      // Immediate in-place upgrade applied
      getPostHogClient().capture({
        distinctId: ctx.userId,
        event: "subscription_upgraded",
        properties: { toPlan, clientId: client.id, isTest: false, method: "stripe_inline" },
      });
      return NextResponse.json({ ok: true, applied: true });
    }
    const result = await requestUpgrade(client.id, toPlan, reason);
    getPostHogClient().capture({
      distinctId: ctx.userId,
      event: "subscription_upgraded",
      properties: { toPlan, clientId: client.id, isTest: client.isTest, method: client.isTest ? "test" : "request" },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SubscriptionError || err instanceof BillingError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[POST /api/v1/client/subscription/upgrade]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
