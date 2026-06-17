import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { rateLimited } from "@/lib/ratelimit";
import { sendAiReply, MessagingError } from "@/lib/modules/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: CORS });
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

/**
 * POST /api/v1/public/ai/reply — the AI website assistant.
 * Auth: site token → tenant. Gated by the `aiAssistant` plan feature, metered against the
 * monthly `aiReplies` allowance. Answers only from the client's approved facts.
 */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "ai-reply", { limit: 12, windowMs: 60_000 }, CORS);
  if (limited) return limited;

  const site = await resolveSite(getSiteToken(req));
  if (!site) return json({ error: "unauthorized" }, 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "validation_error", issues: parsed.error.flatten() }, 400);

  try {
    const { reply } = await sendAiReply(site.clientId, parsed.data.message, parsed.data.history ?? []);
    return json({ reply }, 200);
  } catch (err) {
    if (err instanceof MessagingError) return json({ error: err.code }, err.status);
    console.error("[public/ai/reply]", err);
    return json({ error: "failed" }, 500);
  }
}
