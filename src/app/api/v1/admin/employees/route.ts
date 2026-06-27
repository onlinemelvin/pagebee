import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listEmployees, createEmployee, PayrollError } from "@/lib/modules/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof PayrollError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** GET /api/v1/admin/employees — internal payroll staff. */
export async function GET() {
  try {
    await requireAdmin();
    const employees = await listEmployees();
    return NextResponse.json({ employees });
  } catch (err) {
    return mapError(err);
  }
}

/** POST /api/v1/admin/employees — add an internal employee. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAdmin();
    const body = await req.json().catch(() => null);
    const employee = await createEmployee(body, { userId: ctx.userId });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
