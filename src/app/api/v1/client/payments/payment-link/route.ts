import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { createPaymentLink, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  amountCents: z.number().int().min(50).max(100_000_00), // 50¢ – $100k
  description: z.string().trim().min(1).max(200),
  currency: z.string().trim().length(3).optional(),
  customerEmail: z.string().email().optional(),
});

/**
 * POST /api/v1/client/payments/payment-link — owner mints a standalone Stripe
 * payment link for an ad-hoc amount (sent to a customer out-of-band).
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "manage"));
    assertFeature(client, "payments");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const input = schema.parse(body);
    const link = await createPaymentLink(client.id, input);
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
