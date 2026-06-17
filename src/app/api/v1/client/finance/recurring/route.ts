import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { listRecurringPlans, createRecurringPlan, assertFinanceEnabled, FinanceError } from "@/lib/modules/finance";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/finance/recurring — list recurring plans. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    await assertFinanceEnabled(client.id);
    const plans = await listRecurringPlans(client.id);
    return NextResponse.json({ plans });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** POST /api/v1/client/finance/recurring — create a recurring plan. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    await assertFinanceEnabled(client.id);
    const plan = await createRecurringPlan(client.id, body);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
