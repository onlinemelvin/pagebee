import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { applyRetentionDiscount, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — accept the one-time cancel-flow retention offer (50% off the current plan for 3 cycles).
 * Halts any scheduled cancellation and marks the offer used so it can't be claimed again. Owner-only.
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
    return NextResponse.json(await applyRetentionDiscount(client.id));
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[billing/retention]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
