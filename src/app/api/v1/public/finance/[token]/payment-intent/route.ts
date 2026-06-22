import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { createInvoicePaymentIntent, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/public/finance/{token}/payment-intent — create a PaymentIntent the public pay page
 * confirms inline with Stripe Elements (white-label, no redirect). Returns the client secret.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "finance-pi", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { deposit?: boolean } | null;
  try {
    const intent = await createInvoicePaymentIntent(token, { deposit: Boolean(body?.deposit) });
    return NextResponse.json(intent);
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /public/finance/payment-intent]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
