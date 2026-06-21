import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { sendCampaign, cancelCampaign, updateCampaign, CampaignError, campaignUpdateSchema } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  await requireAdmin();
}

/** PATCH /api/v1/admin/email/campaigns/{id} — edit a draft/scheduled campaign. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guard();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const parsed = campaignUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const { scheduledAt, ...rest } = parsed.data;
    const campaign = await updateCampaign(id, {
      ...rest,
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
    });
    return NextResponse.json({ campaign });
  } catch (err) {
    if (err instanceof CampaignError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}

/** POST /api/v1/admin/email/campaigns/{id}?action=send|cancel */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await guard();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const action = new URL(req.url).searchParams.get("action");
  try {
    if (action === "cancel") {
      const campaign = await cancelCampaign(id);
      return NextResponse.json({ campaign });
    }
    // Default: send now.
    const result = await sendCampaign(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CampaignError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/admin/email/campaigns/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
