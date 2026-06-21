import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listCampaigns, createCampaign, segmentCount, campaignSchema } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/email/campaigns — list campaigns (admin). */
export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
}

/** POST /api/v1/admin/email/campaigns — create a draft or scheduled campaign. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = campaignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });

  const recipients = await segmentCount(parsed.data.segment);
  const campaign = await createCampaign({
    ...parsed.data,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    createdBy: ctx.userId,
  });
  return NextResponse.json({ campaign, recipients }, { status: 201 });
}
