import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { createBillingIntent, recordBillingAgreement, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  flow: z.enum(["setup", "upgrade"]),
  toPlan: z.string().max(40).optional(),
  reason: z.string().max(300).optional(),
  // The client must tick the non-refundable billing terms before any charge; we record acceptance.
  acceptedTerms: z.boolean().optional(),
});

/**
 * POST /api/v1/client/billing/intent — start a setup or upgrade payment. Returns one of:
 *   { kind: "applied" }   — done instantly (in-place upgrade / test account), no card needed
 *   { kind: "requested" } — captured as an admin upgrade request (no-Stripe fallback)
 *   { kind: "card", clientSecret, amountCents, planLabel, flow } — collect a card via the embedded
 *                          Payment Element, then POST /billing/reconcile to finalize.
 * Owner-only. `allowInactive` so a blocked tenant can pay their setup fee to reactivate.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    const result = await createBillingIntent(
      { id: client.id, isTest: client.isTest },
      parsed.data.flow,
      parsed.data.toPlan,
      parsed.data.reason,
    );
    // Record the signed acceptance of the non-refundable terms at the moment of commitment.
    if (parsed.data.acceptedTerms && (result.kind === "card" || result.kind === "applied")) {
      await recordBillingAgreement({
        clientId: client.id,
        plan: result.kind === "card" ? result.planLabel : (parsed.data.toPlan ?? "current"),
        amountCents: result.kind === "card" ? result.amountCents : 0,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[billing/intent]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
