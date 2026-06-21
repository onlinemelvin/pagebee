import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { updateTaxRate, deleteTaxRate, FinanceError } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const taxRate = await updateTaxRate(client.id, id, body);
    return NextResponse.json({ taxRate });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[PATCH /finance/tax-rates/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

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
    await deleteTaxRate(client.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
