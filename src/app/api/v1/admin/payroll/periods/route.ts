import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listPayPeriods, createPayPeriod, PayrollError } from "@/lib/modules/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/payroll/periods — all pay periods. */
export async function GET() {
  try {
    await requireAdmin();
    const periods = await listPayPeriods();
    return NextResponse.json({ periods });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** POST /api/v1/admin/payroll/periods — create a pay period. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAdmin();
    const body = await req.json().catch(() => null);
    const period = await createPayPeriod(body, { userId: ctx.userId });
    return NextResponse.json({ period }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof PayrollError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
