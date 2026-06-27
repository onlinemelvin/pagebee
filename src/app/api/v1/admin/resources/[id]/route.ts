import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { deleteRepResource, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/admin/resources/{id} — remove a rep resource. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    await deleteRepResource(id, { userId: ctx.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
