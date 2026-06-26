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

/** Contact the visitor volunteered in chat, so the team can reach THEM (never invented). */
export interface ContactInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface ChatDecision {
  reply: string;
  intent: ChatIntent;
  escalationReason: AiEscalationReason | null;
  suggestCall: boolean; // true when escalating during business hours (invite them to call)
  contact?: ContactInfo;
}

export interface HoldingResult {
  reply: string | null;
  contact?: ContactInfo;
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
    "offered. Otherwise intent='answer'. Whenever the visitor shares how to reach them (a phone number, email, or " +
    "their name), record it in `contact` so the team can follow up.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "The message shown to the visitor (1–3 short sentences, warm and professional)." },
      intent: { type: "string", enum: ["answer", "book", "escalate"] },
      escalation_reason: { type: "string", enum: ESCALATION_REASONS, description: "Required only when intent='escalate'." },
      contact: {
        type: "object",
        description: "The visitor's OWN contact details, filled ONLY with what they actually shared so the team can reach them. Never invent or guess; omit entirely if they gave nothing.",
        properties: {
          name: { type: "string", description: "The visitor's name, if given." },
          phone: { type: "string", description: "The visitor's phone number, if given." },
          email: { type: "string", description: "The visitor's email, if given." },
        },
      },
    },
    required: ["reply", "intent"],
  },
};

interface RawResp {
  reply?: unknown;
  intent?: unknown;
  escalation_reason?: unknown;
  contact?: unknown;
}

async function planFlags(clientId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { plan: { select: { featureFlags: true } } } });
  return (sub?.plan.featureFlags ?? {}) as Record<string, unknown>;
}

function parseContact(raw: unknown): ContactInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);
  const c: ContactInfo = {};
  if (s(r.name)) c.name = s(r.name);
  if (s(r.phone)) c.phone = s(r.phone);
  if (s(r.email)) c.email = s(r.email);
  return c.name || c.phone || c.email ? c : undefined;
}

/** Gated + metered call to the `respond` tool. Throws ChatError on plan/limit/availability/provider. */
async function invokeRespond(clientId: string, system: string, history: ChatHistoryMsg[], userMessage: string, maxTokens: number): Promise<RawResp> {
  const flags = await planFlags(clientId);
  if (!flags.aiAssistant) throw new ChatError(403, "ai_not_enabled");
  try {
    await requireWithinLimit(clientId, "aiReplies");
  } catch (err) {
    if (err instanceof UsageError) throw new ChatError(429, "ai_limit_reached");
    throw err;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new ChatError(503, "ai_unavailable");

  const anthropic = new Anthropic();
  let raw: RawResp;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      tools: [RESPOND_TOOL],
      tool_choice: { type: "tool", name: "respond" },
      messages: [...history.slice(-10), { role: "user", content: userMessage }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    raw = (block?.input ?? {}) as RawResp;
  } catch {
    throw new ChatError(502, "ai_failed");
  }
  await recordUsage(clientId, "aiReplies").catch(() => {});
  return raw;
}

/**
 * One AI chat turn. Gated by the `aiAssistant` plan flag and metered against the monthly `aiReplies`
 * allowance. Answers ONLY from approved facts; returns a structured decision (answer/book/escalate)
 * plus any contact the visitor shared. Business-hours aware: during hours an escalation invites the
 * customer to call; after hours it gives an ETA.
 */
export async function chatTurn(clientId: string, history: ChatHistoryMsg[], userMessage: string): Promise<ChatDecision> {
  const [facts, settings] = await Promise.all([loadBusinessFacts(clientId), getSchedulingSettings(clientId)]);
  const open = isOpenNow(settings);
  const eta = nextResponseEta(settings);

  // How the AI hands off on escalation: reassure → collect a way to reach THEM (phone preferred) →
  // offer to call the business or wait. It may offer to have the team email/call them; it must never
  // ask the visitor to email or message US (the team is auto-notified).
  const callLine = facts.phone
    ? ` They can also call us at ${facts.phone}, or just wait here — it might take a bit though.`
    : " They're welcome to wait here, though it might take a bit.";
  const etaLine = open ? "shortly" : eta ? `by ${eta}` : "as soon as possible";
  const escalationGuide =
    `WHEN YOU ESCALATE: warmly say something like "Great question — I'll have to check with the team on that and get back to you ${etaLine}." ` +
    `Then ask how they'd like the team to reach them — a phone number is ideal, an email works too — and record whatever they share in 'contact'.${callLine} ` +
    "You may offer to have the team call or email THEM, but never ask the visitor to email or message us — the team is notified automatically.";

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

  const raw = await invokeRespond(clientId, system, history, userMessage, 600);

  const intent: ChatIntent = raw.intent === "book" || raw.intent === "escalate" ? raw.intent : "answer";
  const reply = (typeof raw.reply === "string" && raw.reply.trim()) || "Let me get someone from our team to help with that.";
  const escalationReason: AiEscalationReason | null =
    intent === "escalate"
      ? (ESCALATION_REASONS.includes(raw.escalation_reason as AiEscalationReason) ? (raw.escalation_reason as AiEscalationReason) : "UNKNOWN_TO_KB")
      : null;

  return { reply, intent, escalationReason, suggestCall: intent === "escalate" && open, contact: parseContact(raw.contact) };
}

/**
 * A light "holding" reply for a conversation that's ALREADY escalated (a teammate is being looped
 * in). It keeps the visitor company — acknowledges thanks, answers small talk, captures their
 * contact when offered — but does NOT answer the question the human is handling, make promises, or
 * re-escalate. Returns `{ reply: null }` (stay silent) when off-plan, over the allowance, or on error.
 */
export async function holdingReply(clientId: string, history: ChatHistoryMsg[], userMessage: string): Promise<HoldingResult> {
  const facts = await loadBusinessFacts(clientId);
  const system =
    `You are the website assistant for ${facts.businessName}. A teammate has ALREADY been notified about this ` +
    "visitor's request and will follow up personally — you're just keeping them company while they wait. " +
    "Reply in ONE short, warm sentence (intent='answer'). You may acknowledge a thanks, answer small talk like " +
    "\"are you there?\", or answer a simple question directly from the approved facts. " +
    "If the visitor shares a phone number, email, or name, record it in 'contact' and warmly confirm it back " +
    "(e.g. \"Perfect — the team will reach you at that number shortly.\"). You may offer to have the team call or " +
    "email THEM, but never ask the visitor to email or message us. Do NOT try to answer the question the team is " +
    "handling, do NOT make promises, and for anything else you can't answer, reassure them the team will be in touch.\n\n" +
    "Approved facts:\n" +
    facts.facts.join("\n");

  let raw: RawResp;
  try {
    raw = await invokeRespond(clientId, system, history, userMessage, 300);
  } catch {
    return { reply: null };
  }
  const reply = (typeof raw.reply === "string" && raw.reply.trim()) || null;
  return { reply, contact: parseContact(raw.contact) };
}
