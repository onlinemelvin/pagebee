import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { listNotifications, markRead, markAllRead } from "@/lib/modules/notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/client/notifications — the signed-in client's recent in-app
 * notifications + unread count (drives the topbar bell). `cache: no-store` so a
 * just-raised notification shows on the next poll.
 */
export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const data = await listNotifications(client.id);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

const markSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(50) }),
]);

/** POST /api/v1/client/notifications — mark read: `{ all: true }` or `{ ids: [...] }`. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  const parsed = markSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  if ("all" in parsed.data) await markAllRead(client.id);
  else await markRead(client.id, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
