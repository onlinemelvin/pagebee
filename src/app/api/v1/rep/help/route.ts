import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { createHelpRequest, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/help — a rep requests technical help (routed to admins). Body: { message, previewId? } */
export async function POST(req: Request) {
  try {
    const { ctx, employee } = await requireRep();
    const body = (await req.json().catch(() => ({}))) as { message?: string; previewId?: string };
    const result = await createHelpRequest(employee.id, { message: body.message ?? "", previewId: body.previewId }, { userId: ctx.userId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
