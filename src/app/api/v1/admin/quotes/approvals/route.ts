import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/quotes/approvals — the pending quote-approval queue. */
export async function GET() {
  try {
    await requireAdmin();
    const approvals = await listPendingApprovals();
    return NextResponse.json({ approvals });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
