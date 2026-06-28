import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listPreviewDiscountApprovals } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/previews/discount-approvals — pending preview setup-discount requests. */
export async function GET() {
  try {
    await requireAdmin();
    const approvals = await listPreviewDiscountApprovals();
    return NextResponse.json({ approvals });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
