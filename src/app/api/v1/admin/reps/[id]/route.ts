import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { deleteRep, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/admin/reps/{id} — permanently remove a rep (login, employee, contract, assignments,
 * quotes). Refused with 409 `rep_has_commissions` if the rep has a commission history; pass `?force=1`
 * to override and destroy that history too.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    const force = new URL(req.url).searchParams.get("force") === "1";
    const result = await deleteRep(id, { force, actor: { userId: ctx.userId } });
    return NextResponse.json({ deleted: result.id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
