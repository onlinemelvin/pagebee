import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { refundPayment, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/payments/refund — refund a payment (full or partial). Body: { paymentId, amount? } */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await req.json().catch(() => null)) as { paymentId?: string; amount?: number } | null;
  if (!body?.paymentId) return NextResponse.json({ error: "paymentId_required" }, { status: 400 });
  try {
    const refund = await refundPayment(client.id, body.paymentId, body.amount);
    return NextResponse.json({ refund });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /payments/refund]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
