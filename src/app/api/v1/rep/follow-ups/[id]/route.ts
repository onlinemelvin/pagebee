import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { completeFollowUp, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/rep/follow-ups/{id} — mark a follow-up done. */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employee } = await requireRep();
    const { id } = await params;
    const followUp = await completeFollowUp(employee.id, id);
    return NextResponse.json({ followUp });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
