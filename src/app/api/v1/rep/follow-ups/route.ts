import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { listFollowUps } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/rep/follow-ups?include_done=1 — the rep's follow-ups (open by default). */
export async function GET(req: Request) {
  try {
    const { employee } = await requireRep();
    const includeCompleted = new URL(req.url).searchParams.get("include_done") === "1";
    const followUps = await listFollowUps(employee.id, { includeCompleted });
    return NextResponse.json({ followUps });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
