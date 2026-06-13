import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { listTaxRates, createTaxRate, FinanceError } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ taxRates: await listTaxRates(client.id) });
}

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
    const taxRate = await createTaxRate(client.id, body);
    return NextResponse.json({ taxRate }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /finance/tax-rates]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
