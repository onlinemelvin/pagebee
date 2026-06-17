import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getClientWorkspace } from "@/lib/modules/client";
import { prisma } from "@/lib/db";
import { LEAD_GOALS } from "@/lib/site/lead-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ goal: z.enum(LEAD_GOALS) });

/**
 * POST /api/v1/client/lead-form — set the site's primary CTA / lead-form goal (the same list the
 * intake uses). Stored on Website.leadFormGoal and applied LIVE at serve time: it re-labels the page's
 * CTA buttons + the form's submit button and re-types captured leads, with no rebuild. Gated to the
 * Connect+ form feature, matching the Inquiries page that hosts the dropdown.
 */
export async function POST(req: Request) {
  try {
    await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const ws = await getClientWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ws.caps.forms) return NextResponse.json({ error: "feature_not_in_plan" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const website = await prisma.website.findFirst({ where: { clientId: ws.client.id }, select: { id: true } });
  if (!website) return NextResponse.json({ error: "no_website" }, { status: 404 });

  await prisma.website.update({ where: { id: website.id }, data: { leadFormGoal: parsed.data.goal } });
  revalidatePath("/client/inquiries");
  return NextResponse.json({ ok: true, goal: parsed.data.goal });
}
