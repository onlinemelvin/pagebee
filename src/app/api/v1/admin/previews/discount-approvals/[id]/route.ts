import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { decidePreviewDiscountApproval, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/previews/discount-approvals/{id} — approve or reject a preview discount. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const approval = await decidePreviewDiscountApproval(id, body, { userId: ctx.userId });
    return NextResponse.json({ approval });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
