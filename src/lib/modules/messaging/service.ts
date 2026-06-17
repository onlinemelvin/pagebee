import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/modules/email";
import { requireWithinLimit, recordUsage, UsageError } from "@/lib/modules/usage";

export class MessagingError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function planFlags(clientId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { plan: { select: { featureFlags: true } } },
  });
  return (sub?.plan.featureFlags ?? {}) as Record<string, unknown>;
}

export interface AiReply {
  reply: string;
}

/**
 * The AI assistant reply path (REAL). Gated by the `aiAssistant` plan feature and metered
 * against the monthly `aiReplies` allowance. Answers ONLY from the client's approved knowledge
 * base + business facts — it never invents. Records one unit of usage per successful reply.
 */
export async function sendAiReply(
  clientId: string,
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<AiReply> {
  const flags = await planFlags(clientId);
  if (!flags.aiAssistant) throw new MessagingError(403, "ai_not_enabled");

  try {
    await requireWithinLimit(clientId, "aiReplies");
  } catch (err) {
    if (err instanceof UsageError) throw new MessagingError(429, "ai_limit_reached");
    throw err;
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new MessagingError(503, "ai_unavailable");

  const [client, kb, services] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true, businessType: true, ownerPhone: true, ownerEmail: true } }),
    prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } }),
    prisma.service.findMany({ where: { clientId, showOnWebsite: true }, select: { title: true, description: true, durationMinutes: true, price: true }, take: 40 }),
  ]);

  const facts: string[] = [
    `Business: ${client?.businessName ?? "this business"}${client?.businessType ? ` (${client.businessType})` : ""}`,
    client?.ownerEmail ? `Contact email: ${client.ownerEmail}` : "",
    client?.ownerPhone ? `Contact phone: ${client.ownerPhone}` : "",
    services.length ? `Services: ${services.map((s) => `${s.title}${s.price != null ? ` ($${(s.price / 100).toFixed(0)})` : ""}`).join(", ")}` : "",
    kb?.data ? `Approved facts: ${JSON.stringify(kb.data)}` : "",
  ].filter(Boolean);

  const anthropic = new Anthropic();
  let reply: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system:
        `You are the website assistant for ${client?.businessName ?? "a local business"}. ` +
        "Answer customer questions helpfully and briefly (1–3 sentences), in a warm, professional tone. " +
        "Use ONLY the facts below — never invent prices, hours, guarantees, availability, or policies you weren't given. " +
        "If you don't have the answer, say so and suggest contacting the business directly.\n\n" +
        facts.join("\n"),
      messages: [...history.slice(-8), { role: "user", content: message }],
    });
    reply = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch {
    throw new MessagingError(502, "ai_failed");
  }

  await recordUsage(clientId, "aiReplies");
  return { reply: reply || "I'm not sure about that — please reach out to us directly and we'll help." };
}

/**
 * SMS send path (STUB — no real provider wired yet). Gated by `smsAlerts` and metered against the
 * monthly `sms` allowance. Records usage and logs; swap the body for a real provider later.
 */
export async function sendSms(clientId: string, to: string, body: string): Promise<{ stubbed: boolean; to: string }> {
  const flags = await planFlags(clientId);
  if (!flags.smsAlerts) throw new MessagingError(403, "sms_not_enabled");
  try {
    await requireWithinLimit(clientId, "sms");
  } catch (err) {
    if (err instanceof UsageError) throw new MessagingError(429, "sms_limit_reached");
    throw err;
  }
  await recordUsage(clientId, "sms");
  console.log(`[sms stub] → ${to}: ${body.slice(0, 80)}`);
  return { stubbed: true, to };
}

/**
 * Client-scoped, metered email (STUB-grade wiring). Records one `email` unit and delegates to the
 * real mailer. Transactional email is measured but not hard-blocked, so confirmations always send.
 * Existing call sites still use sendEmail directly; migrate them to this when ready.
 */
export async function sendClientEmail(
  clientId: string,
  params: { to: string; subject: string; html: string; replyTo?: string },
): Promise<{ id: string | null; stubbed: boolean }> {
  await recordUsage(clientId, "email").catch(() => {});
  return sendEmail(params);
}
