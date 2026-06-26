import { NextResponse, type NextRequest } from "next/server";
import { sweepChatEscalations } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/cron/chat/sweep — drive the wait-time experience for escalated website chats: post the
 * staged "still waiting" reassurances, and at the per-client timeout hand off to a lead. Scheduled
 * every minute from vercel.json (the nudges/timeout work in minutes, so it needs a tight cadence).
 *
 * Auth: Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>`; we also accept
 * INTERNAL_API_SECRET for internal tooling. Fail-closed when neither secret is configured.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await sweepChatEscalations();
  return NextResponse.json({ ok: true, ...result });
}
