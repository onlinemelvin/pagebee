import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { updateLead, leadUpdateSchema } from "@/lib/modules/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/client/leads/{id} — update one of the caller's leads (status/assignment). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const owns = await prisma.lead.findFirst({ where: { id, clientId: client.id }, select: { id: true } });
  if (!owns) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const lead = await updateLead(id, parsed.data, { userId: ctx.userId });
  return NextResponse.json({ lead });
}
