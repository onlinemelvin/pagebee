import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getChatConfig, setChatConfig } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/chats/settings — the owner's website-chat config. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ config: await getChatConfig(client.id) }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  greeting: z.string().trim().max(280).optional(),
  escalationTimeoutMinutes: z.number().int().min(1).max(120).optional(),
});

/** PUT /api/v1/client/chats/settings — update website-chat config (owner only). */
export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ config: await setChatConfig(client.id, parsed.data) });
}
