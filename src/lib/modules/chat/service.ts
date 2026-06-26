import crypto from "node:crypto";
import type { MessageSenderType, AiEscalationReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emit } from "@/lib/events";
import { writeAudit } from "@/lib/modules/audit";
import { sendEmail, escapeHtml } from "@/lib/modules/email";
import { createNotification, isGroupEmailAllowed } from "@/lib/modules/notification";
import { notifyOwnerSms } from "@/lib/modules/messaging";
import { chatTurn, holdingReply, ChatError, type ChatHistoryMsg } from "./orchestrator";
import { getChatConfig } from "./config";

// Conversation status state machine.
const S = { AI: "ai", ESCALATED: "escalated", HUMAN: "human", AWAITING: "awaiting_contact", CLOSED: "closed" } as const;

const MAX_BODY = 2000;
const newPublicToken = () => `chat_${crypto.randomBytes(24).toString("base64url")}`;

function appBase(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  return `${root.includes("localhost") ? "http" : "https"}://${root}`;
}

export type ChatRole = "customer" | "ai" | "owner" | "system";
export interface ChatMessageDTO {
  id: string;
  role: ChatRole;
  body: string;
  at: string; // ISO
}

function roleOf(t: MessageSenderType): ChatRole {
  if (t === "CUSTOMER") return "customer";
  if (t === "AI") return "ai";
  if (t === "SYSTEM") return "system";
  return "owner"; // OWNER | EMPLOYEE
}
function toDTO(m: { id: string; senderType: MessageSenderType; body: string; createdAt: Date }): ChatMessageDTO {
  return { id: m.id, role: roleOf(m.senderType), body: m.body, at: m.createdAt.toISOString() };
}

/** Append a message to a conversation. */
async function addMessage(conversationId: string, senderType: MessageSenderType, body: string) {
  return prisma.message.create({ data: { conversationId, senderType, body }, select: { id: true, senderType: true, body: true, createdAt: true } });
}

/** History (last 10) mapped for the model: customer→user, ai/owner→assistant, system dropped. */
async function getHistory(conversationId: string): Promise<ChatHistoryMsg[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, senderType: { not: "SYSTEM" } },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: { senderType: true, body: true },
  });
  return rows.slice(-10).map((r) => ({ role: r.senderType === "CUSTOMER" ? "user" : "assistant", content: r.body }));
}

// ── Public (widget) ──────────────────────────────────────────────────────────

export interface PublicTurnResult {
  conversationId: string;
  publicToken: string;
  status: string;
  /** New messages produced this turn (AI/system replies) — the widget already rendered the visitor's. */
  messages: ChatMessageDTO[];
  /** "book" when the AI detected booking intent — the widget offers a Book button. */
  cta?: "book";
}

/**
 * Handle one inbound message from the website chat widget. Creates the Conversation on the first
 * turn; while in the `ai` state the AI answers (and may escalate); once a human is engaged the AI
 * stays quiet and the message is routed to the owner. `contact` finalizes the timed-out handoff.
 * clientId is resolved from the site token by the caller — never from the body.
 */
export async function handleCustomerMessage(params: {
  clientId: string;
  conversationId?: string | null;
  publicToken?: string | null;
  message?: string | null;
  contact?: { name?: string; email?: string; phone?: string } | null;
}): Promise<PublicTurnResult> {
  const { clientId } = params;
  const message = (params.message ?? "").toString().trim().slice(0, MAX_BODY);
  const contact = params.contact ?? null;

  // 1. Resolve (and authorize) the conversation, or open a new one.
  let conv = params.conversationId
    ? await prisma.conversation.findUnique({ where: { id: params.conversationId } })
    : null;
  if (params.conversationId) {
    if (!conv || conv.clientId !== clientId || conv.publicToken !== params.publicToken) throw new ChatError(403, "forbidden");
  }
  if (!conv) {
    const token = newPublicToken();
    conv = await prisma.conversation.create({
      data: { clientId, channel: "WEBSITE_CHAT", status: S.AI, publicToken: token, subject: "Website chat" },
    });
    await prisma.aiConversation.create({ data: { clientId, conversationId: conv.id, mode: "AUTO_REPLY" } });
  }
  const publicToken = conv.publicToken as string;
  const out: ChatMessageDTO[] = [];

  // 2. Record the visitor's message (if any). Echo it back (with its id) so the widget renders the
  // server copy and the poller can dedupe — otherwise the optimistic bubble + the polled copy double up.
  if (message) {
    const cm = await addMessage(conv.id, "CUSTOMER", message);
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastCustomerAt: new Date() } });
    out.push(toDTO(cm));
  }

  // 3. Contact capture (from the timed-out handoff form, or the visitor volunteering it).
  if (contact && (contact.email || contact.phone)) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { visitorName: contact.name || conv.visitorName, visitorEmail: contact.email || conv.visitorEmail, visitorPhone: contact.phone || conv.visitorPhone },
    });
    conv = (await prisma.conversation.findUnique({ where: { id: conv.id } }))!;
    await createChatLead(conv);
    const reach = contact.email && contact.phone ? "email or text" : contact.email ? "email" : "text";
    const sys = await addMessage(conv.id, "SYSTEM", `Thanks! Our team will get back to you by ${reach} as soon as possible.`);
    await prisma.conversation.update({ where: { id: conv.id }, data: { status: S.CLOSED } });
    out.push(toDTO(sys));
    return { conversationId: conv.id, publicToken, status: S.CLOSED, messages: out };
  }

  if (!message) return { conversationId: conv.id, publicToken, status: conv.status, messages: out };

  // 4. Route by state.
  // The owner is live in the thread → AI stays quiet so it doesn't talk over them.
  if (conv.status === S.HUMAN) {
    return { conversationId: conv.id, publicToken, status: conv.status, messages: out };
  }
  // Escalated but no human has jumped in yet → keep the visitor company with a light holding reply
  // (acknowledgments / small talk / simple facts) without answering the escalated question or re-escalating.
  if (conv.status === S.ESCALATED) {
    const history = await getHistory(conv.id);
    let hold: { reply: string | null; contact?: { name?: string; phone?: string; email?: string } } = { reply: null };
    try {
      hold = await holdingReply(clientId, history, message);
    } catch {
      hold = { reply: null };
    }
    // If the visitor shared contact details, capture them → creates/updates the lead.
    if (hold.contact) conv = await captureContact(conv, hold.contact);
    if (hold.reply) {
      const aiMsg = await addMessage(conv.id, "AI", hold.reply);
      const aiConv = await prisma.aiConversation.findUnique({ where: { conversationId: conv.id }, select: { id: true } });
      if (aiConv) await prisma.aiMessage.create({ data: { aiConversationId: aiConv.id, role: "assistant", content: hold.reply } });
      out.push(toDTO(aiMsg));
    }
    return { conversationId: conv.id, publicToken, status: conv.status, messages: out };
  }
  if (conv.status === S.AWAITING) {
    const sys = await addMessage(conv.id, "SYSTEM", "Could you share the best email or phone number to reach you? I'll pass it to our team.");
    out.push(toDTO(sys));
    return { conversationId: conv.id, publicToken, status: conv.status, messages: out };
  }

  // 5. AI turn (status ai, or reopening a closed chat).
  if (conv.status === S.CLOSED) await prisma.conversation.update({ where: { id: conv.id }, data: { status: S.AI } });
  const history = await getHistory(conv.id);
  let decision;
  try {
    decision = await chatTurn(clientId, history, message);
  } catch (err) {
    // Fail-soft: never leave the visitor hanging. Escalate to a human instead of erroring.
    const reply = err instanceof ChatError && err.code === "ai_limit_reached"
      ? "Thanks for your message! Let me get a team member to help you."
      : "Sorry, I'm having trouble right now — let me get someone from our team to help.";
    const aiMsg = await addMessage(conv.id, "AI", reply);
    out.push(toDTO(aiMsg));
    await escalate(conv.id, clientId, "UNKNOWN_TO_KB");
    return { conversationId: conv.id, publicToken, status: S.ESCALATED, messages: out };
  }

  const aiMsg = await addMessage(conv.id, "AI", decision.reply);
  const aiConv = await prisma.aiConversation.findUnique({ where: { conversationId: conv.id }, select: { id: true } });
  if (aiConv) await prisma.aiMessage.create({ data: { aiConversationId: aiConv.id, role: "assistant", content: decision.reply } });
  out.push(toDTO(aiMsg));

  let status: string = conv.status;
  if (decision.intent === "escalate") {
    await escalate(conv.id, clientId, decision.escalationReason ?? "UNKNOWN_TO_KB");
    status = S.ESCALATED;
  }
  // Capture any contact the visitor shared → creates/updates the lead. Run AFTER escalation so a lead
  // born on this same turn inherits escalationNotifiedAt and doesn't double-alert the owner.
  if (decision.contact) await captureContact(conv, decision.contact);

  return { conversationId: conv.id, publicToken, status, messages: out, cta: decision.intent === "book" ? "book" : undefined };
}

/** Poll for messages newer than `after` (ISO) — how the widget shows owner/AI replies. */
export async function pollMessages(params: { conversationId: string; publicToken: string; after?: string | null }): Promise<{ status: string; messages: ChatMessageDTO[] }> {
  const conv = await prisma.conversation.findUnique({ where: { id: params.conversationId }, select: { status: true, publicToken: true } });
  if (!conv || conv.publicToken !== params.publicToken) throw new ChatError(403, "forbidden");
  const after = params.after ? new Date(params.after) : new Date(0);
  const rows = await prisma.message.findMany({
    where: { conversationId: params.conversationId, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, senderType: true, body: true, createdAt: true },
  });
  return { status: conv.status, messages: rows.map(toDTO) };
}

// ── Escalation + lead handoff ─────────────────────────────────────────────────

async function escalate(conversationId: string, clientId: string, reason: AiEscalationReason) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { escalatedAt: true, escalationNotifiedAt: true } });
  if (!conv) return;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: S.ESCALATED, escalatedAt: conv.escalatedAt ?? new Date() },
  });
  const aiConv = await prisma.aiConversation.findUnique({ where: { conversationId }, select: { id: true } });
  await prisma.aiEscalation.create({ data: { clientId, aiConversationId: aiConv?.id ?? null, reason } });

  // Notify the owner once (idempotent on escalationNotifiedAt).
  if (!conv.escalationNotifiedAt) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { escalationNotifiedAt: new Date() } });
    await notifyOwnerEscalation(clientId, conversationId).catch((e) => console.error("[chat] escalation notify failed", e));
  }
}

async function notifyOwnerEscalation(clientId: string, conversationId: string) {
  const link = `${appBase()}/client/chats/${conversationId}`;
  await createNotification({ clientId, type: "chat.escalated", body: "A website visitor needs a hand in chat." });
  await notifyOwnerSms(clientId, "inquiries", `A website visitor needs you in chat. Reply: ${link}`);
  if (await isGroupEmailAllowed(clientId, "inquiries")) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerEmail: true, businessName: true } });
    if (client?.ownerEmail) {
      await sendEmail({
        to: client.ownerEmail,
        subject: `A visitor needs you in chat — ${client.businessName ?? "your website"}`,
        html: `<p>Your AI assistant needs a human to step in on a live website chat.</p>
<p><a href="${link}" style="display:inline-block;background:#f59e0b;color:#1c1917;padding:10px 18px;border-radius:10px;font-weight:600;text-decoration:none">Open the chat</a></p>
<p style="color:#78716c;font-size:13px">Or paste this link: ${escapeHtml(link)}</p>`,
      });
    }
  }
}

/** Create a Lead from a chat conversation (idempotent) and link it, reusing the lead.created fan-out.
 *  When the chat was already escalated (owner pinged), the lead.created owner alert is suppressed so
 *  the owner isn't double-notified. */
async function createChatLead(conv: { id: string; clientId: string; leadId: string | null; visitorName: string | null; visitorEmail: string | null; visitorPhone: string | null; escalationNotifiedAt?: Date | null }) {
  if (conv.leadId) return;
  const lead = await prisma.lead.create({
    data: {
      clientId: conv.clientId,
      type: "SERVICE_INQUIRY",
      name: conv.visitorName || "Website visitor",
      email: conv.visitorEmail,
      phone: conv.visitorPhone,
      message: "From website chat — the visitor asked something the AI couldn't answer and needs follow-up.",
      source: "chat",
    },
  });
  await prisma.conversation.update({ where: { id: conv.id }, data: { leadId: lead.id } });
  await writeAudit({ action: "lead.created", entityType: "Lead", entityId: lead.id, clientId: conv.clientId });
  await emit("lead.created", { lead, suppressOwnerAlert: !!conv.escalationNotifiedAt });
}

/**
 * Persist contact the visitor shared in chat, then create the linked Lead (or top up an existing one
 * with any newly-known detail). Returns the refreshed conversation so callers keep using it.
 */
async function captureContact(conv: { id: string }, contact: { name?: string; phone?: string; email?: string }) {
  const updated = await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      ...(contact.name ? { visitorName: contact.name } : {}),
      ...(contact.phone ? { visitorPhone: contact.phone } : {}),
      ...(contact.email ? { visitorEmail: contact.email } : {}),
    },
  });
  if (updated.leadId) {
    await prisma.lead.update({
      where: { id: updated.leadId },
      data: {
        ...(updated.visitorName ? { name: updated.visitorName } : {}),
        ...(updated.visitorPhone ? { phone: updated.visitorPhone } : {}),
        ...(updated.visitorEmail ? { email: updated.visitorEmail } : {}),
      },
    }).catch(() => {});
  } else {
    await createChatLead(updated);
  }
  return updated;
}

// ── Wait-time nudges + timeout handoff (worker) ───────────────────────────────

// Proactive "still waiting" reassurances, posted (as AI messages — canned, no AI spend) at increasing
// fractions of the per-client timeout while an escalated chat waits for the owner. The final hand-off
// (take their number) happens at the full timeout.
const WAIT_NUDGES = [
  "I've let the team know — they usually respond pretty fast, so I'll give them a few moments. 🙂",
  "Thanks for hanging in there! We're a little busier than usual right now — bear with me while I track down someone who can help.",
];
const NUDGE_FRACTIONS = [0.3, 0.65]; // of the timeout (the rest of the way → final handoff)

/**
 * Keep escalated chats alive while the owner is being looped in: post staged "still waiting"
 * reassurances, and at the full timeout hand off — capture contact → Lead (if known) or ask for a
 * number. All steps are idempotent (nudgeCount / timedOutAt). Runs from the worker every ~60s.
 */
export async function sweepChatEscalations(now: Date = new Date()): Promise<{ handed: number }> {
  // Bound the scan to escalations at least 1 min old; per-client timing is checked below.
  const candidates = await prisma.conversation.findMany({
    where: { status: S.ESCALATED, timedOutAt: null, escalatedAt: { not: null, lt: new Date(now.getTime() - 60_000) } },
    select: { id: true, clientId: true, leadId: true, visitorName: true, visitorEmail: true, visitorPhone: true, escalatedAt: true, lastOwnerAt: true, escalationNotifiedAt: true, nudgeCount: true },
    take: 100,
  });
  let handed = 0;
  for (const c of candidates) {
    if (c.lastOwnerAt && c.escalatedAt && c.lastOwnerAt > c.escalatedAt) continue; // owner jumped in → leave it
    const cfg = await getChatConfig(c.clientId);
    const timeoutMs = cfg.escalationTimeoutMinutes * 60_000;
    const elapsed = now.getTime() - c.escalatedAt!.getTime();

    // Full timeout → hand off to a lead.
    if (elapsed >= timeoutMs) {
      await prisma.conversation.update({ where: { id: c.id }, data: { timedOutAt: now } });
      if (c.visitorPhone || c.visitorEmail || c.leadId) {
        await createChatLead(c);
        const how = c.visitorPhone ? "give you a call" : c.visitorEmail ? "email you" : "reach out";
        await addMessage(c.id, "AI", `Looks like the team's tied up at the moment — I've passed your request along and they'll ${how} as soon as they're free. Thanks for your patience!`);
        await prisma.conversation.update({ where: { id: c.id }, data: { status: S.CLOSED } });
      } else {
        await addMessage(c.id, "AI", "Seems like we're out of luck for the moment — let me take your number and have the team reach out as soon as they're available. What's the best phone number for you?");
        await prisma.conversation.update({ where: { id: c.id }, data: { status: S.AWAITING } });
      }
      handed++;
      continue;
    }

    // Before the timeout: send the next staged reassurance, if its threshold has passed (each once).
    let target = 0;
    for (let i = 0; i < NUDGE_FRACTIONS.length; i++) if (elapsed >= NUDGE_FRACTIONS[i] * timeoutMs) target = i + 1;
    if (c.nudgeCount < target && c.nudgeCount < WAIT_NUDGES.length) {
      await addMessage(c.id, "AI", WAIT_NUDGES[c.nudgeCount]);
      await prisma.conversation.update({ where: { id: c.id }, data: { nudgeCount: { increment: 1 } } });
      handed++;
    }
  }
  return { handed };
}

// ── Owner (dashboard) ─────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  status: string;
  visitorName: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  escalated: boolean;
}

/** Conversations for the owner inbox — needs-attention (escalated/awaiting) first, then recent. */
export async function listConversations(clientId: string): Promise<ConversationSummary[]> {
  const convs = await prisma.conversation.findMany({
    where: { clientId, channel: "WEBSITE_CHAT" },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, visitorName: true, lastOwnerAt: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      _count: { select: { messages: { where: { senderType: "CUSTOMER" } } } },
    },
  });
  // Unread = customer messages newer than the owner's last reply.
  const rows = await Promise.all(convs.map(async (c) => {
    const unread = await prisma.message.count({
      where: { conversationId: c.id, senderType: "CUSTOMER", ...(c.lastOwnerAt ? { createdAt: { gt: c.lastOwnerAt } } : {}) },
    });
    const escalated = c.status === S.ESCALATED || c.status === S.AWAITING;
    return {
      id: c.id, status: c.status, visitorName: c.visitorName,
      lastMessage: c.messages[0]?.body ?? null,
      lastAt: c.messages[0]?.createdAt.toISOString() ?? null,
      unread, escalated,
    };
  }));
  return rows.sort((a, b) => Number(b.escalated) - Number(a.escalated) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

/** Full thread for the owner window (tenant-scoped). */
export async function getConversation(clientId: string, id: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, clientId },
    select: {
      id: true, status: true, visitorName: true, visitorEmail: true, visitorPhone: true, leadId: true,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, senderType: true, body: true, createdAt: true } },
    },
  });
  if (!conv) return null;
  return { ...conv, messages: conv.messages.map(toDTO) };
}

/** Owner sends a manual reply: routes to the visitor, takes over the thread, resolves escalations. */
export async function ownerReply(clientId: string, id: string, body: string): Promise<ChatMessageDTO> {
  const conv = await prisma.conversation.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!conv) throw new ChatError(404, "not_found");
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) throw new ChatError(400, "empty");
  const msg = await addMessage(id, "OWNER", text);
  await prisma.conversation.update({ where: { id }, data: { status: S.HUMAN, lastOwnerAt: new Date() } });
  await prisma.aiEscalation.updateMany({ where: { aiConversation: { conversationId: id }, resolved: false }, data: { resolved: true } });
  return toDTO(msg);
}

/** AI-draft a suggested reply for the owner (auto-compose) — returns text, does not send. */
export async function draftReply(clientId: string, id: string): Promise<{ draft: string }> {
  const conv = await prisma.conversation.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!conv) throw new ChatError(404, "not_found");
  const history = await getHistory(id);
  const lastCustomer = [...history].reverse().find((h) => h.role === "user");
  const decision = await chatTurn(clientId, history, lastCustomer?.content ?? "Please draft a helpful reply to the visitor's latest message.");
  return { draft: decision.reply };
}

/** Close a conversation. */
export async function closeConversation(clientId: string, id: string): Promise<void> {
  const conv = await prisma.conversation.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!conv) throw new ChatError(404, "not_found");
  await prisma.conversation.update({ where: { id }, data: { status: S.CLOSED } });
}

export { ChatError };
