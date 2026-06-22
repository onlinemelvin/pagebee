import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/modules/notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/notifications/settings — the owner's email-notification prefs. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ prefs: await getNotificationPrefs(client.id) }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  inquiries: z.boolean().optional(),
  appointments: z.boolean().optional(),
  billing: z.boolean().optional(),
  website: z.boolean().optional(),
});

/** PUT /api/v1/client/notifications/settings — update the email-notification prefs. */
export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });

  const prefs = await setNotificationPrefs(client.id, parsed.data);
  return NextResponse.json({ prefs });
}
