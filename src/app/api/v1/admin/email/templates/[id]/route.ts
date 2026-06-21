import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateTemplate, deleteTemplate, templateUpdateSchema } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/email/templates/{id} — edit a template. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const parsed = templateUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });
  const template = await updateTemplate(id, parsed.data);
  return NextResponse.json({ template });
}

/** DELETE /api/v1/admin/email/templates/{id} */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
