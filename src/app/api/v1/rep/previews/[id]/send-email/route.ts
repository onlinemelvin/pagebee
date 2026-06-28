import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { emailPreviewToProspect, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/previews/{id}/send-email — email the prospect their preview link. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, employee } = await requireRep();
    const { id } = await params;
    const result = await emailPreviewToProspect(employee.id, id, { userId: ctx.userId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
