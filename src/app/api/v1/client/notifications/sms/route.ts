import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getSmsPrefs, setSmsPrefs } from "@/lib/modules/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/notifications/sms — the owner's SMS-alert prefs. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ prefs: await getSmsPrefs(client.id) }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  phone: z.string().trim().max(30).optional(),
  inquiries: z.boolean().optional(),
  appointments: z.boolean().optional(),
});

/** PUT /api/v1/client/notifications/sms — update the SMS-alert prefs (owner only). */
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

  const prefs = await setSmsPrefs(client.id, parsed.data);
  return NextResponse.json({ prefs });
}
