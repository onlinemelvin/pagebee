import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { requestUpgrade, SubscriptionError } from "@/lib/modules/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/subscription/upgrade — upgrade to a higher tier. Test accounts apply
 * instantly; real accounts capture an upgrade request for admin/sales. Body: { toPlan, reason? }.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = (await req.json().catch(() => null)) as { toPlan?: unknown; reason?: unknown } | null;
  const toPlan = typeof body?.toPlan === "string" ? body.toPlan : null;
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  if (!toPlan) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });

  try {
    const result = await requestUpgrade(client.id, toPlan, reason);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SubscriptionError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/subscription/upgrade]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
