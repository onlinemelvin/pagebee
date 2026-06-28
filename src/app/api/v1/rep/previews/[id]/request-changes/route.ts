import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { repRequestChanges, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/previews/{id}/request-changes — free-text instruction → AI regenerates the preview. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, employee } = await requireRep();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const result = await repRequestChanges(employee.id, id, body.note ?? "", { userId: ctx.userId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
