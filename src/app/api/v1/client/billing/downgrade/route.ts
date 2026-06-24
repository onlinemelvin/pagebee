import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { scheduleDowngrade, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ toPlan: z.string().min(1).max(40) });

/**
 * POST — schedule a downgrade to a lower tier at the end of the current billing period (no refund).
 * Owner-only. Returns { effectiveAt } for the UI.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    return NextResponse.json(await scheduleDowngrade(client.id, parsed.data.toPlan));
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[billing/downgrade]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
