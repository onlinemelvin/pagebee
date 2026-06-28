import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { repPerformance, discountImpact } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/analytics/sales — per-rep performance + discount-impact rollups. */
export async function GET() {
  try {
    await requireAdmin();
    const [reps, discount] = await Promise.all([repPerformance(), discountImpact()]);
    return NextResponse.json({ reps, discount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
