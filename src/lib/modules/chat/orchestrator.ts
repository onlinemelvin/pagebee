import Anthropic from "@anthropic-ai/sdk";
import type { AiEscalationReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWithinLimit, recordUsage, UsageError } from "@/lib/modules/usage";
import { getSchedulingSettings } from "@/lib/modules/booking";
import { isOpenNow, nextResponseEta } from "@/lib/modules/booking/hours";
import { loadBusinessFacts } from "./facts";

export class ChatError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export type ChatIntent = "answer" | "book" | "escalate";

export interface ChatDecision {
  reply: string;
  intent: ChatIntent;
  escalationReason: AiEscalationReason | null;
  suggestCall: boolean; // true when escalating during business hours (invite them to call)
}

export interface ChatHistoryMsg {
  role: "user" | "assistant";
  content: string;
}

// Valid escalation reasons the model may pick (mirror of the Prisma AiEscalationReason enum).
const ESCALATION_REASONS: AiEscalationReason[] = [
  "CUSTOM_PRICING", "ANGRY_CUSTOMER", "LEGAL_QUESTION", "MEDICAL_QUESTION",
  "FINANCIAL_QUESTION", "REFUND_REQUEST", "DISCOUNT_REQUEST", "UNKNOWN_TO_KB", "GUARANTEED_AVAILABILITY",
];

const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description:
    "Reply to the website visitor and classify the turn. Use intent='book' when they want to schedule/book; " +
    "intent='escalate' when you cannot answer from the approved facts or the topic is sensitive (custom pricing, " +
    "discounts, refunds, legal/medical/financial advice, an angry customer, or guaranteeing availability) — never " +
    "invent an answer in those cases. IMPORTANT: the listed services may be incomplete, so if the visitor asks " +
    "whether the business offers a service you don't see, escalate (UNKNOWN_TO_KB) — do NOT tell them it isn't " +
    "offered. Otherwise intent='answer'.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "The message shown to the visitor (1–3 short sentences, warm and professional)." },
      intent: { type: "string", enum: ["answer", "book", "escalate"] },
      escalation_reason: { type: "string", enum: ESCALATION_REASONS, description: "Required only when intent='escalate'." },
    },
    required: ["reply", "intent"],
  },
};

async function planFlags(clientId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { plan: { select: { featureFlags: true } } } });
  return (sub?.plan.featureFlags ?? {}) as Record<string, unknown>;
}

/**
 * One AI chat turn. Gated by the `aiAssistant` plan flag and metered against the monthly `aiReplies`
 * allowance. Answers ONLY from approved facts; returns a structured decision (answer/book/escalate)
 * so the service layer can persist + run side effects (escalation, lead handoff). Business-hours
 * aware: during hours an escalation invites the customer to call; after hours it gives an ETA.
 */
export async function chatTurn(clientId: string, history: ChatHistoryMsg[], userMessage: string): Promise<ChatDecision> {
  const flags = await planFlags(clientId);
  if (!flags.aiAssistant) throw new ChatError(403, "ai_not_enabled");
  try {
    await requireWithinLimit(clientId, "aiReplies");
  } catch (err) {
    if (err instanceof UsageError) throw new ChatError(429, "ai_limit_reached");
    throw err;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new ChatError(503, "ai_unavailable");

  const [facts, settings] = await Promise.all([loadBusinessFacts(clientId), getSchedulingSettings(clientId)]);
  const open = isOpenNow(settings);
  const eta = nextResponseEta(settings);

  // How the AI hands off on escalation: reassure → ask for a phone number to reach THEM → offer to
  // call the business or wait here. Never push email (the team is auto-notified; the owner wants calls).
  const callLine = facts.phone
    ? ` They can also call us at ${facts.phone}, or just wait here — it might take a bit though.`
    : " They're welcome to wait here, though it might take a bit.";
  const etaLine = open ? "shortly" : eta ? `by ${eta}` : "as soon as possible";
  const escalationGuide =
    `WHEN YOU ESCALATE: warmly say something like "Great question — I'll have to check with the team on that and get back to you ${etaLine}." ` +
    `Then ask for a good phone number to reach them (an email is fine too).${callLine} ` +
    "NEVER tell a visitor to email us or share our email address — the team is notified automatically the moment they leave a number, so steer them to call or leave a phone number.";

  const system =
    `You are the friendly website assistant for ${facts.businessName}${facts.businessType ? ` (${facts.businessType})` : ""}. ` +
    "Answer visitor questions helpfully and briefly (1–3 sentences), warm and professional. " +
    "Use ONLY the approved facts below — never invent prices, hours, guarantees, availability, or policies you weren't given. " +
    "The services list may be INCOMPLETE: if a visitor asks whether we do a service you don't see listed, do NOT say we don't " +
    "offer it and NEVER refer them to another business — the owner may well do it. Instead set intent='escalate' (UNKNOWN_TO_KB). " +
    "If a visitor wants to book or schedule, set intent='book' and encourage them (a booking button will appear). " +
    "If you cannot answer from the facts, or the topic is sensitive, set intent='escalate' with the best reason and do NOT guess. " +
    escalationGuide +
    "\n\nApproved facts:\n" +
    facts.facts.join("\n");

  const anthropic = new Anthropic();
  let raw: { reply?: unknown; intent?: unknown; escalation_reason?: unknown };
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system,
      tools: [RESPOND_TOOL],
      tool_choice: { type: "tool", name: "respond" },
      messages: [...history.slice(-10), { role: "user", content: userMessage }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    raw = (block?.input ?? {}) as typeof raw;
  } catch {
    throw new ChatError(502, "ai_failed");
  }

  await recordUsage(clientId, "aiReplies").catch(() => {});

  const intent: ChatIntent = raw.intent === "book" || raw.intent === "escalate" ? raw.intent : "answer";
  const reply = (typeof raw.reply === "string" && raw.reply.trim()) || "Let me get someone from our team to help with that.";
  const escalationReason: AiEscalationReason | null =
    intent === "escalate"
      ? (ESCALATION_REASONS.includes(raw.escalation_reason as AiEscalationReason) ? (raw.escalation_reason as AiEscalationReason) : "UNKNOWN_TO_KB")
      : null;

  return { reply, intent, escalationReason, suggestCall: intent === "escalate" && open };
}
