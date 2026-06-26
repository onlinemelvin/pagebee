import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { getConversation, ownerReply, draftReply, closeConversation, ChatError } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/chats/[id] — the full thread (owner view). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("inquiries", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const conv = await getConversation(client.id, id);
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation: conv }, { headers: { "Cache-Control": "no-store" } });
}

const actionSchema = z.object({
  action: z.enum(["reply", "draft", "close"]),
  message: z.string().max(2000).optional(),
});

/** POST /api/v1/client/chats/[id] — { action: "reply" | "draft" | "close", message? }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("inquiries", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    if (parsed.data.action === "draft") return NextResponse.json(await draftReply(client.id, id));
    if (parsed.data.action === "close") {
      await closeConversation(client.id, id);
      return NextResponse.json({ ok: true });
    }
    const msg = await ownerReply(client.id, id, parsed.data.message ?? "");
    return NextResponse.json({ ok: true, message: msg });
  } catch (err) {
    if (err instanceof ChatError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/chats/[id]]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
