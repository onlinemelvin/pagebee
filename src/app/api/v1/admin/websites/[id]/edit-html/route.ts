import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { saveManualEdit } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/websites/{versionId}/edit-html — save a manual HTML edit as a NEW version
 * (needs website:review). Body: { html }. Returns the new version's id.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { html?: unknown } | null;
  if (!body || typeof body.html !== "string" || !/<html[\s>]/i.test(body.html)) {
    return NextResponse.json({ error: "invalid_html" }, { status: 400 });
  }

  try {
    const version = await saveManualEdit(id, body.html, ctx.userId);
    return NextResponse.json({ ok: true, id: version.id, version: version.version });
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/edit-html]", err);
    const message = err instanceof Error ? err.message : "error";
    // version_not_found is a real 404; anything else is a server error (don't mask it as not_found).
    const status = message === "version_not_found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
