import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { revertToVersion } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/websites/{versionId}/revert — snapshot this version's exact content into a
 * new current version (needs website:review). Forward-only, so it's instantly undoable too.
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
    const version = await revertToVersion(id, ctx.userId);
    return NextResponse.json({ ok: true, id: version.id, version: version.version });
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/revert]", err);
    const message = err instanceof Error ? err.message : "error";
    const status = message === "version_not_found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
