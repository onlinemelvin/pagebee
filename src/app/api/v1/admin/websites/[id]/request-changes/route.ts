import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { requestReviewChanges } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/websites/{versionId}/request-changes — bundle the open change-request
 * pins into one instruction and regenerate. The new version re-enters the review queue.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    const result = await requestReviewChanges(id, ctx.userId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/request-changes]", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
