import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { stripeConfigured } from "@/lib/stripe/client";
import { createBillingCheckout, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ kind: z.enum(["setup", "upgrade"]), toPlan: z.string().max(40).optional() });

/** POST — create a Stripe Checkout session for the plan setup fee + subscription, or an upgrade.
 *  Owner-only. Returns { url } to redirect the client to Stripe. */
export async function POST(req: Request) {
  let client;
  try {
    // allowInactive: paying the setup fee / subscription is how a blocked tenant reactivates.
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    const { url } = await createBillingCheckout(client.id, parsed.data.kind, parsed.data.toPlan);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[billing/checkout]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
