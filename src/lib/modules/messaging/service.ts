import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/modules/email";
import { requireWithinLimit, recordUsage, UsageError } from "@/lib/modules/usage";
import { sendProviderSms } from "@/lib/sms/twilio";
import { isOptedOut, normalizePhone } from "./optout";

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

// Appended to every alert so recipients always have a documented opt-out (TCPA). Twilio strips/echoes
// STOP handling, but we include it in copy too for compliance + clarity.
const STOP_FOOTER = "\n\nReply STOP to opt out.";

export interface SmsSendResult {
  status: "sent" | "stubbed" | "suppressed";
  to: string;
}

/**
 * SMS send path (Twilio, with a console-stub fallback when unconfigured). Gated by the `smsAlerts`
 * plan flag and metered against the monthly `sms` allowance. Honors the STOP suppression list
 * (never sends to an opted-out number), appends the opt-out footer, and records every attempt in
 * SmsLog for audit. `consentVerified` must be true at the call site (the owner opted in / it's their
 * own number) — we record it on the log row.
 */
export async function sendSms(
  clientId: string,
  to: string,
  body: string,
  opts: { consentVerified?: boolean } = {},
): Promise<SmsSendResult> {
  const flags = await planFlags(clientId);
  if (!flags.smsAlerts) throw new MessagingError(403, "sms_not_enabled");

  const phone = normalizePhone(to);
  if (!phone) throw new MessagingError(400, "invalid_phone");

  // Compliance gate: never message a suppressed number. Log it and return without metering a send.
  if (await isOptedOut(phone)) {
    await prisma.smsLog.create({
      data: { clientId, toPhone: phone, body, status: "FAILED", error: "suppressed:opted_out", consentVerified: opts.consentVerified ?? false },
    }).catch(() => {});
    return { status: "suppressed", to: phone };
  }

  try {
    await requireWithinLimit(clientId, "sms");
  } catch (err) {
    if (err instanceof UsageError) throw new MessagingError(429, "sms_limit_reached");
    throw err;
  }

  const text = body.includes("STOP") ? body : body + STOP_FOOTER;
  const log = await prisma.smsLog.create({
    data: { clientId, toPhone: phone, body: text, status: "QUEUED", consentVerified: opts.consentVerified ?? false },
    select: { id: true },
  });

  try {
    const res = await sendProviderSms(phone, text);
    await prisma.smsLog.update({
      where: { id: log.id },
      data: { status: res.stubbed ? "QUEUED" : "SENT", providerId: res.sid },
    });
    // Only meter REAL sends — a stubbed send (no provider configured) must never burn the allowance.
    if (!res.stubbed) await recordUsage(clientId, "sms").catch(() => {});
    return { status: res.stubbed ? "stubbed" : "sent", to: phone };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.smsLog.update({ where: { id: log.id }, data: { status: "FAILED", error: message } }).catch(() => {});
    throw new MessagingError(502, "sms_failed");
  }
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
