import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { listConversations } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/chats — the owner's website-chat inbox (needs-attention first). */
export async function GET() {
  let client;
  try {
    ({ client } = await requireCapability("inquiries", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ conversations: await listConversations(client.id) }, { headers: { "Cache-Control": "no-store" } });
}
