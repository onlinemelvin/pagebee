import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { mintPlanAuthToken, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/finance/recurring/{id}/authorize-link — mint (or return) the public link the
 * owner shares so their customer can authorize a card on file for automatic payments.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    const link = await mintPlanAuthToken(client.id, id);
    return NextResponse.json(link);
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
