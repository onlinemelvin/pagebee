import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { releaseToClient } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/websites/{versionId}/release — release a reviewed draft to the client.
 * The client can then see the preview to review/approve. Does not publish the site live.
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
    await releaseToClient(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/release]", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
