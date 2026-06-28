import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { generateDraftRecords, approvePayPeriod, markPayPeriodPaid, PayrollError } from "@/lib/modules/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/payroll/periods/{id}/action — { action: "generate" | "approve" | "pay" }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    const { action } = (await req.json().catch(() => ({}))) as { action?: string };
    let result: unknown;
    if (action === "generate") result = await generateDraftRecords(id, { userId: ctx.userId });
    else if (action === "approve") result = await approvePayPeriod(id, { userId: ctx.userId });
    else if (action === "pay") result = await markPayPeriodPaid(id, { userId: ctx.userId });
    else return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayrollError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
