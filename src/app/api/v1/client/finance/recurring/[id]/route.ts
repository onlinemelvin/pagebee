import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { updateRecurringPlan, deleteRecurringPlan, FinanceError } from "@/lib/modules/finance";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/client/finance/recurring/{id} — edit a plan or change its status (pause/resume/end). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const plan = await updateRecurringPlan(client.id, id, body);
    return NextResponse.json({ plan });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** DELETE /api/v1/client/finance/recurring/{id} — remove a plan (past invoices are kept). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    await deleteRecurringPlan(client.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
