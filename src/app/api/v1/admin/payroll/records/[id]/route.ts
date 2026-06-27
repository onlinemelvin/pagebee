import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updatePayrollRecord, PayrollError } from "@/lib/modules/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/payroll/records/{id} — edit a draft record (hours/bonus/deductions…). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const record = await updatePayrollRecord(id, body, { userId: ctx.userId });
    return NextResponse.json({ record });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof PayrollError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
