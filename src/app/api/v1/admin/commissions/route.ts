import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listSettlementQueue } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/commissions — the settlement queue (eligible + approved, grouped by rep). */
export async function GET() {
  try {
    await requireAdmin();
    const reps = await listSettlementQueue();
    return NextResponse.json({ reps });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
