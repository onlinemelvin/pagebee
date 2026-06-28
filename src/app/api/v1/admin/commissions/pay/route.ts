import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { markCommissionsPaid, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/commissions/pay — mark approved commissions paid ({ recordIds, payoutReference }). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { recordIds?: string[]; payoutReference?: string };
    const result = await markCommissionsPaid(
      Array.isArray(body.recordIds) ? body.recordIds : [],
      body.payoutReference ?? "",
      { userId: ctx.userId },
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
