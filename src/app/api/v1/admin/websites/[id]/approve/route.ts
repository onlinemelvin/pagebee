import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { approveAndPublish } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/websites/{versionId}/approve — approve & publish a version. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  try {
    await approveAndPublish(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/admin/websites/[id]/approve]", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
