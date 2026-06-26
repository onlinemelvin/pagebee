import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { getPreviewPlanOverride } from "@/lib/modules/website";
import { isChatLive, getChatConfig } from "@/lib/modules/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...(extra ?? {}) } });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/v1/public/chat/config — does the website chat widget show, and with what greeting?
 * Auth: site token → tenant. `enabled` = `aiAssistant` on-plan AND owner turned chat on (preview
 * gates against the previewed tier). No caching — a toggle must reflect on the next load.
 */
export async function GET(req: Request) {
  const limited = await rateLimited(req, "chat-config", { limit: 120, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  try {
    const isPreview = new URL(req.url).searchParams.get("preview") === "1";
    const planOverride = isPreview ? await getPreviewPlanOverride(site.clientId) : undefined;
    const enabled = await isChatLive(site.clientId, planOverride);
    if (!enabled) return json({ enabled: false }, 200, { "Cache-Control": "no-store" });
    const cfg = await getChatConfig(site.clientId);
    return json({ enabled: true, greeting: cfg.greeting }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    console.error("[GET /api/v1/public/chat/config]", err);
    return json({ error: "internal_error" }, 500);
  }
}
