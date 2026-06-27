import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { repCommissionStatement } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/rep/earnings — the rep's commission statement (records + totals by status). */
export async function GET() {
  try {
    const { employee } = await requireRep();
    const statement = await repCommissionStatement(employee.id);
    return NextResponse.json(statement);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
