import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { cancelSubscription, reactivateSubscription, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["cancel", "reactivate"]).default("cancel"),
  immediate: z.boolean().optional(),
});

/**
 * POST /api/v1/client/subscription/cancel — owner cancels (graceful by default; `immediate` ends
 * now) or reactivates a scheduled cancellation. Reactivation is allowed for inactive accounts.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });
  const reactivating = parsed.data.action === "reactivate";

  let client;
  try {
    ({ client } = await requireOwner(reactivating ? { allowInactive: true } : undefined));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const result = reactivating
      ? await reactivateSubscription(client.id)
      : await cancelSubscription(client.id, { immediate: parsed.data.immediate });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /client/subscription/cancel]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
