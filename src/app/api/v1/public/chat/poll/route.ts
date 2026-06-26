import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { pollMessages, ChatError } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/v1/public/chat/poll?conversationId&publicToken&after — new messages since `after` (ISO),
 * so the widget surfaces owner/AI replies. The publicToken must match the conversation (thread
 * isolation); the site token authorizes the tenant.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "chat-poll", { limit: 240, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const publicToken = url.searchParams.get("publicToken");
  if (!conversationId || !publicToken) return json({ error: "missing_params" }, 400);

  try {
    const result = await pollMessages({ conversationId, publicToken, after: url.searchParams.get("after") });
    return json(result, 200);
  } catch (err) {
    if (err instanceof ChatError) return json({ error: err.code }, err.status);
    console.error("[GET /api/v1/public/chat/poll]", err);
    return json({ error: "internal_error" }, 500);
  }
}
