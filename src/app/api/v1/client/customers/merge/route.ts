import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { mergeCustomers, mergeInputSchema, CustomerError } from "@/lib/modules/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/customers/merge  body { primaryId, duplicateId } — fold a duplicate into the
 *  primary (repoints all history, then deletes the duplicate). */
export async function POST(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  const parsed = mergeInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const customer = await mergeCustomers(client.id, parsed.data.primaryId, parsed.data.duplicateId, { userId: ctx.userId });
    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof CustomerError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
