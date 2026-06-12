import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { publishUpdate } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/websites/{versionId}/approve — publish an approved update to an ALREADY-LIVE
 * site (needs website:review). Guarded in publishUpdate to published sites only, so it can't
 * bypass the initial launch flow (where the client approves + pays). Initial drafts use /release.
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
    await publishUpdate(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/approve]", err);
    const message = err instanceof Error ? err.message : "error";
    const status = message === "version_not_found" ? 404 : message === "not_a_live_update" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
