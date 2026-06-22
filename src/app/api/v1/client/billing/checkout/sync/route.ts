import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { syncCheckoutSession, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ sessionId: z.string().min(1).max(200) });

/**
 * POST /api/v1/client/billing/checkout/sync — reconcile a Checkout session on the customer's return
 * from Stripe, so the upgrade/launch applies even if the webhook is delayed or not configured.
 * Idempotent and safe to call repeatedly (the page polls until "applied"). `allowInactive` so a
 * still-blocked tenant who just paid their setup fee can finalize the launch.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    const result = await syncCheckoutSession(client.id, parsed.data.sessionId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /client/billing/checkout/sync]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
