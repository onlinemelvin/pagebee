import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { getRepContract, getCommissionTerms } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/rep/contract — the rep's commission agreement + the terms it carries. */
export async function GET() {
  try {
    const { employee } = await requireRep();
    const [contract, terms] = await Promise.all([getRepContract(employee.id), getCommissionTerms()]);
    return NextResponse.json({ contract, terms });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
