import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { reconcileFromStripe } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/billing/reconcile — finalize after an embedded Payment Element confirmation.
 * Self-heals the local subscription from Stripe's truth (links the now-active subscription, marks the
 * setup fee paid + launches the site, or applies the upgrade's plan switch). Idempotent and fail-soft,
 * so it's safe to call right after `confirmPayment` even though the webhook also runs it. Owner-only.
 */
export async function POST() {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const result = await reconcileFromStripe(client.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[billing/reconcile]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
