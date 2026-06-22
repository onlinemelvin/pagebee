import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { createPlanSetupIntent, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/public/authorize/{token}/setup-intent — create the SetupIntent the card-authorization
 * page confirms with Stripe Elements to save a card for off-session recurring billing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "plan-setup-intent", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  try {
    const intent = await createPlanSetupIntent(token);
    return NextResponse.json(intent);
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /public/authorize/setup-intent]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
