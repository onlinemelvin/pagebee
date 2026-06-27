import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, AuthError } from "@/lib/auth/session";
import { getProspect, updateProspect, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** GET /api/v1/rep/prospects/{id} — one of the rep's prospects + its timeline. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employee } = await requireRep();
    const { id } = await params;
    const prospect = await getProspect(employee.id, id);
    return NextResponse.json({ prospect });
  } catch (err) {
    return mapError(err);
  }
}

/** PATCH /api/v1/rep/prospects/{id} — update fields/status. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, employee } = await requireRep();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const prospect = await updateProspect(employee.id, id, body, { userId: ctx.userId });
    return NextResponse.json({ prospect });
  } catch (err) {
    return mapError(err);
  }
}
