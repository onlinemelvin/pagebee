import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateLead, leadUpdateSchema } from "@/lib/modules/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/leads/{id} — update status / assignment (admin only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const lead = await updateLead(id, parsed.data, { userId: ctx.userId });
    return NextResponse.json({ lead });
  } catch (err) {
    console.error("[PATCH /api/v1/admin/leads/[id]]", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
