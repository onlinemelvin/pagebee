import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, AuthError } from "@/lib/auth/session";
import { addCallNote, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** POST /api/v1/rep/prospects/{id}/call-notes — record a call outcome + note. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, employee } = await requireRep();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const callNote = await addCallNote(employee.id, id, body, { userId: ctx.userId });
    return NextResponse.json({ callNote }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
