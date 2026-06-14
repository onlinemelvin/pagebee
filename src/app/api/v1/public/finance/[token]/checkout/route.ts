import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { createInvoiceCheckout, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/public/finance/{token}/checkout — start a Stripe Checkout session for the customer. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "finance-checkout", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { deposit?: boolean } | null;
  try {
    const url = await createInvoiceCheckout(token, { deposit: Boolean(body?.deposit) });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /public/finance/checkout]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
