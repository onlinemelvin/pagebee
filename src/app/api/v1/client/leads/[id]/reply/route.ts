import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { replyToLead } from "@/lib/modules/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });

/** POST /api/v1/client/leads/{id}/reply — email a reply to the inquiry. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await replyToLead(client.id, id, parsed.data.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/client/leads/[id]/reply]", err);
    const code = err instanceof Error ? err.message : "reply_failed";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
