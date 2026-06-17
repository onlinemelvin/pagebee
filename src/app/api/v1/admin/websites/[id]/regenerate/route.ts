import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { regenerateFromScratch, getWebsiteGenStatus } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — poll the website's newest version + whether a generation is still running. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const status = await getWebsiteGenStatus(id);
  if (!status) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(status);
}

/**
 * POST /api/v1/admin/websites/{versionId}/regenerate — re-run a full generation from the same
 * original instructions (no pins/edits). The new version re-enters the review queue.
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
    const result = await regenerateFromScratch(id, ctx.userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/regenerate]", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
