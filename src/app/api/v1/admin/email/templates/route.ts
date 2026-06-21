import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listTemplates, createTemplate, CampaignError, templateSchema } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/email/templates — list reusable templates. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ templates: await listTemplates() });
}

/** POST /api/v1/admin/email/templates — create a template. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = templateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const template = await createTemplate({ ...parsed.data, createdBy: ctx.userId });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
