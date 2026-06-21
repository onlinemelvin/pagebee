import { NextResponse } from "next/server";
import { unsubscribe, resubscribe, resolveUnsubscribeToken } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token(req: Request): string | null {
  return new URL(req.url).searchParams.get("token");
}

/** GET /api/v1/public/unsubscribe?token= — resolve a token to its address (for the confirm page). */
export async function GET(req: Request) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const resolved = await resolveUnsubscribeToken(t);
  if (!resolved) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  return NextResponse.json({ email: resolved.email });
}

/**
 * POST /api/v1/public/unsubscribe?token= — opt the address out of all marketing.
 * Doubles as the RFC 8058 one-click endpoint (mail clients POST here directly),
 * so it must succeed without a session or CSRF token.
 */
export async function POST(req: Request) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  // Support a re-subscribe action from the confirm page.
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "resubscribe") {
    const resolved = await resolveUnsubscribeToken(t);
    if (!resolved) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    await resubscribe(resolved.email);
    return NextResponse.json({ ok: true, state: "subscribed" });
  }

  const res = await unsubscribe(t, { reason: "user" });
  if (!res) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  return NextResponse.json({ ok: true, state: "unsubscribed", email: res.email });
}
