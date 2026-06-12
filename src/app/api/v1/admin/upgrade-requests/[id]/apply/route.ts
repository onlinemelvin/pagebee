import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { applyUpgradeRequest, SubscriptionError } from "@/lib/modules/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/upgrade-requests/{id}/apply — apply a captured upgrade request (admin). */
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
    await applyUpgradeRequest(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SubscriptionError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/admin/upgrade-requests/[id]/apply]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
