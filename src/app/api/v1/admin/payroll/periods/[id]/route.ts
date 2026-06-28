import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { getPayPeriod, PayrollError } from "@/lib/modules/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/payroll/periods/{id} — period detail with records + totals. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const period = await getPayPeriod(id);
    return NextResponse.json({ period });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayrollError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
