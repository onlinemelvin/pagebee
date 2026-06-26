import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { handleCustomerMessage, isChatLive, ChatError } from "@/lib/modules/chat";
import "@/lib/events/subscribers"; // register lead.created handlers (chat handoff emits it)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const schema = z.object({
  conversationId: z.string().max(40).optional(),
  publicToken: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
  contact: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z.string().trim().email().max(200).optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/public/chat/message — one visitor turn. Auth: site token → tenant (clientId never
 * trusted from the body). Returns `{ conversationId, publicToken, status, messages }`. In preview the
 * widget runs as a non-persisting demo.
 */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "chat-message", { limit: 20, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "validation_error", issues: parsed.error.flatten() }, 400);

  // Preview: canned demo reply, nothing persisted, no AI spend.
  if (site.status === "preview") {
    return json(
      {
        demo: true,
        conversationId: "demo",
        publicToken: "demo",
        status: "ai",
        messages: [{ id: "demo", role: "ai", body: "👋 This is a preview of your AI assistant. Once your site is live, I'll answer visitors from your business info and hand off to you when needed.", at: new Date().toISOString() }],
      },
      200,
    );
  }

  // Server-side gate: chat must be on-plan + enabled (the widget hides otherwise, but enforce here).
  if (!(await isChatLive(site.clientId))) return json({ error: "chat_disabled" }, 403);

  try {
    const result = await handleCustomerMessage({
      clientId: site.clientId,
      conversationId: parsed.data.conversationId ?? null,
      publicToken: parsed.data.publicToken ?? null,
      message: parsed.data.message ?? null,
      contact: parsed.data.contact ? { ...parsed.data.contact, email: parsed.data.contact.email || undefined } : null,
    });
    return json(result, 200);
  } catch (err) {
    if (err instanceof ChatError) return json({ error: err.code }, err.status);
    console.error("[POST /api/v1/public/chat/message]", err);
    return json({ error: "internal_error" }, 500);
  }
}
