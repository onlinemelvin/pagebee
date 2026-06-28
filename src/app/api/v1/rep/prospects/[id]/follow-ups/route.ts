import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, AuthError } from "@/lib/auth/session";
import { scheduleFollowUp, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** POST /api/v1/rep/prospects/{id}/follow-ups — schedule a follow-up reminder. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employee } = await requireRep();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const followUp = await scheduleFollowUp(employee.id, id, body);
    return NextResponse.json({ followUp }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
