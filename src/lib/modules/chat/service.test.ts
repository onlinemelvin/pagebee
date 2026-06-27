import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ sendEmail: vi.fn(), escapeHtml: (s: string) => s }));
vi.mock("@/lib/modules/notification", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  isGroupEmailAllowed: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/modules/messaging", () => ({
  notifyOwnerSms: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./orchestrator", () => ({
  chatTurn: vi.fn(),
  holdingReply: vi.fn(),
  ChatError: class ChatError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));
vi.mock("./config", () => ({
  getChatConfig: vi.fn().mockResolvedValue({ enabled: true, greeting: "Hi!", escalationTimeoutMinutes: 5 }),
}));

import {
  handleCustomerMessage,
  pollMessages,
  ownerReply,
  closeConversation,
  getConversation,
  sweepChatEscalations,
} from "./service";
import { chatTurn, holdingReply } from "./orchestrator";
import { getChatConfig } from "./config";
import { emit } from "@/lib/events";
import { writeAudit } from "@/lib/modules/audit";

// vi.resetAllMocks() in setup.ts clears mockResolvedValue implementations between tests.
// Re-seed the getChatConfig mock (5-min timeout) before every test that may call sweepChatEscalations.
beforeEach(() => {
  vi.mocked(getChatConfig).mockResolvedValue({ enabled: true, greeting: "Hi!", escalationTimeoutMinutes: 5 });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2025-01-01T12:00:00Z");

function makeConv(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv1",
    clientId: "c1",
    status: "ai",
    publicToken: "tok1",
    visitorName: null,
    visitorEmail: null,
    visitorPhone: null,
    leadId: null,
    escalatedAt: null,
    escalationNotifiedAt: null,
    lastOwnerAt: null,
    lastCustomerAt: null,
    nudgeCount: 0,
    timedOutAt: null,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    senderType: "AI",
    body: "Hello",
    createdAt: new Date("2025-01-01T12:00:01Z"),
    conversationId: "conv1",
    ...overrides,
  };
}

// ── handleCustomerMessage ────────────────────────────────────────────────────

describe("handleCustomerMessage — new conversation", () => {
  it("creates a conversation on the first turn when no conversationId supplied", async () => {
    prismaMock.conversation.create.mockResolvedValue(makeConv({ publicToken: "tok-new" }));
    prismaMock.aiConversation.create.mockResolvedValue({ id: "ac1" });
    prismaMock.conversation.update.mockResolvedValue(makeConv());
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "CUSTOMER", body: "Hi" }));
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiMessage.create.mockResolvedValue({});
    prismaMock.message.findMany.mockResolvedValue([]);
    vi.mocked(chatTurn).mockResolvedValue({ reply: "Hello!", intent: "answer", escalationReason: null, suggestCall: false });

    const result = await handleCustomerMessage({ clientId: "c1", message: "Hi" });

    expect(prismaMock.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c1" }) }),
    );
    expect(result.status).toBe("ai");
    expect(result.conversationId).toBe("conv1");
  });
});

describe("handleCustomerMessage — tenant scoping (IDOR backstop)", () => {
  it("throws 403 when publicToken does not match", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ publicToken: "other-token" }));

    await expect(
      handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "hi" }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("throws 403 when the conversation belongs to a different client", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ clientId: "other-client", publicToken: "tok1" }));

    await expect(
      handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "hi" }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});

describe("handleCustomerMessage — AI state", () => {
  it("calls chatTurn and appends the AI reply", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ status: "ai", publicToken: "tok1", clientId: "c1" }));
    prismaMock.conversation.update.mockResolvedValue(makeConv());
    prismaMock.message.create
      .mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER", body: "Hello?" }))
      .mockResolvedValueOnce(makeMessage({ senderType: "AI", body: "Hi there!" }));
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiMessage.create.mockResolvedValue({});
    vi.mocked(chatTurn).mockResolvedValue({ reply: "Hi there!", intent: "answer", escalationReason: null, suggestCall: false });

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "Hello?" });

    expect(chatTurn).toHaveBeenCalledWith("c1", expect.any(Array), "Hello?");
    expect(result.messages.some((m) => m.role === "ai")).toBe(true);
  });

  it("escalates and notifies owner when AI returns escalate intent", async () => {
    prismaMock.conversation.findUnique
      .mockResolvedValueOnce(makeConv({ status: "ai", publicToken: "tok1", clientId: "c1" })) // handleCustomerMessage
      .mockResolvedValueOnce(makeConv({ escalatedAt: null, escalationNotifiedAt: null })); // escalate()
    prismaMock.conversation.update.mockResolvedValue(makeConv());
    prismaMock.message.create
      .mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER" }))
      .mockResolvedValueOnce(makeMessage({ senderType: "AI" }));
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiMessage.create.mockResolvedValue({});
    prismaMock.aiEscalation.create.mockResolvedValue({});
    vi.mocked(chatTurn).mockResolvedValue({ reply: "Team will help.", intent: "escalate", escalationReason: "CUSTOM_PRICING", suggestCall: true });

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "Give me a discount" });

    expect(prismaMock.aiEscalation.create).toHaveBeenCalled();
    expect(result.status).toBe("escalated");
  });

  it("sets cta='book' when AI returns book intent", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ status: "ai", publicToken: "tok1", clientId: "c1" }));
    prismaMock.conversation.update.mockResolvedValue(makeConv());
    prismaMock.message.create
      .mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER" }))
      .mockResolvedValueOnce(makeMessage({ senderType: "AI" }));
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiMessage.create.mockResolvedValue({});
    vi.mocked(chatTurn).mockResolvedValue({ reply: "Sure, here are slots.", intent: "book", escalationReason: null, suggestCall: false });

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "Book me" });

    expect(result.cta).toBe("book");
  });

  it("fail-soft escalates when chatTurn throws (ai_limit_reached)", async () => {
    const ChatErrorClass = (await import("./orchestrator")).ChatError;
    prismaMock.conversation.findUnique
      .mockResolvedValueOnce(makeConv({ status: "ai", publicToken: "tok1", clientId: "c1" }))
      .mockResolvedValueOnce(makeConv({ escalatedAt: null, escalationNotifiedAt: null }));
    prismaMock.conversation.update.mockResolvedValue(makeConv());
    prismaMock.message.create
      .mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER" }))
      .mockResolvedValueOnce(makeMessage({ senderType: "AI", body: "Let me get a team member." }));
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiEscalation.create.mockResolvedValue({});
    vi.mocked(chatTurn).mockRejectedValue(new ChatErrorClass(429, "ai_limit_reached"));

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "hi" });

    expect(result.status).toBe("escalated");
    expect(prismaMock.aiEscalation.create).toHaveBeenCalled();
  });
});

describe("handleCustomerMessage — ESCALATED state (holding)", () => {
  it("calls holdingReply and appends the reply", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ status: "escalated", publicToken: "tok1", clientId: "c1" }));
    prismaMock.conversation.update.mockResolvedValue(makeConv({ status: "escalated" }));
    prismaMock.message.create.mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER" }))
      .mockResolvedValueOnce(makeMessage({ senderType: "AI", body: "Still here!" }));
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.aiConversation.findUnique.mockResolvedValue({ id: "ac1" });
    prismaMock.aiMessage.create.mockResolvedValue({});
    vi.mocked(holdingReply).mockResolvedValue({ reply: "Still here!" });

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "Are you there?" });

    expect(holdingReply).toHaveBeenCalled();
    expect(result.status).toBe("escalated");
    expect(result.messages.some((m) => m.role === "ai")).toBe(true);
  });

  it("is silent (no AI message) when holdingReply returns null", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ status: "escalated", publicToken: "tok1", clientId: "c1" }));
    prismaMock.message.create.mockResolvedValueOnce(makeMessage({ senderType: "CUSTOMER" }));
    prismaMock.message.findMany.mockResolvedValue([]);
    vi.mocked(holdingReply).mockResolvedValue({ reply: null });

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "hello" });

    // Only the customer echo message; no AI message appended
    expect(result.messages.filter((m) => m.role === "ai")).toHaveLength(0);
  });
});

describe("handleCustomerMessage — HUMAN state", () => {
  it("stays silent when a human owns the thread", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue(makeConv({ status: "human", publicToken: "tok1", clientId: "c1" }));
    prismaMock.conversation.update.mockResolvedValue(makeConv({ status: "human" }));
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "CUSTOMER" }));

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", message: "hi" });

    expect(chatTurn).not.toHaveBeenCalled();
    expect(holdingReply).not.toHaveBeenCalled();
    expect(result.status).toBe("human");
  });
});

describe("handleCustomerMessage — contact capture", () => {
  it("closes the conversation and creates a lead when contact is submitted", async () => {
    const conv = makeConv({ status: "awaiting_contact", publicToken: "tok1", clientId: "c1", visitorName: null, visitorEmail: null, visitorPhone: null });
    prismaMock.conversation.findUnique
      .mockResolvedValueOnce(conv)  // initial lookup
      .mockResolvedValueOnce({ ...conv, visitorEmail: "v@x.com", leadId: null }); // after update
    prismaMock.conversation.update.mockResolvedValue({ ...conv, visitorEmail: "v@x.com", leadId: null });
    prismaMock.lead.create.mockResolvedValue({ id: "l1", clientId: "c1" });
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "SYSTEM" }));

    const result = await handleCustomerMessage({ clientId: "c1", conversationId: "conv1", publicToken: "tok1", contact: { email: "v@x.com" } });

    expect(prismaMock.lead.create).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.created" }));
    expect(emit).toHaveBeenCalledWith("lead.created", expect.objectContaining({ lead: expect.any(Object) }));
    expect(result.status).toBe("closed");
  });
});

// ── pollMessages ─────────────────────────────────────────────────────────────

describe("pollMessages", () => {
  it("throws 403 when publicToken mismatches", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue({ status: "ai", publicToken: "correct-token" });

    await expect(
      pollMessages({ conversationId: "conv1", publicToken: "wrong-token" }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("returns messages newer than the given `after` timestamp", async () => {
    prismaMock.conversation.findUnique.mockResolvedValue({ status: "ai", publicToken: "tok1" });
    prismaMock.message.findMany.mockResolvedValue([makeMessage({ id: "m2", senderType: "AI", body: "Hello" })]);

    const result = await pollMessages({ conversationId: "conv1", publicToken: "tok1", after: "2025-01-01T00:00:00Z" });

    expect(result.messages).toHaveLength(1);
    expect(result.status).toBe("ai");
  });
});

// ── ownerReply ───────────────────────────────────────────────────────────────

describe("ownerReply", () => {
  it("throws 404 when conversation not found for tenant", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);

    await expect(ownerReply("c1", "conv1", "hello")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("throws 400 for empty body", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    await expect(ownerReply("c1", "conv1", "   ")).rejects.toMatchObject({ status: 400, code: "empty" });
  });

  it("persists the reply, sets status=human, and resolves escalations", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "OWNER", body: "On it!" }));
    prismaMock.conversation.update.mockResolvedValue({});
    prismaMock.aiEscalation.updateMany.mockResolvedValue({ count: 1 });

    const result = await ownerReply("c1", "conv1", "On it!");

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderType: "OWNER", body: "On it!" }) }),
    );
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "human" }) }),
    );
    expect(prismaMock.aiEscalation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolved: true } }),
    );
    expect(result.role).toBe("owner");
  });
});

// ── closeConversation ────────────────────────────────────────────────────────

describe("closeConversation", () => {
  it("throws 404 for unknown conversation", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);

    await expect(closeConversation("c1", "conv1")).rejects.toMatchObject({ status: 404 });
  });

  it("sets status=closed", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    prismaMock.conversation.update.mockResolvedValue({});

    await closeConversation("c1", "conv1");

    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "closed" } }),
    );
  });
});

// ── getConversation ──────────────────────────────────────────────────────────

describe("getConversation", () => {
  it("returns null for unknown / wrong-tenant conversation", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);

    expect(await getConversation("c1", "conv1")).toBeNull();
  });

  it("returns the conversation with mapped message roles", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: "conv1",
      status: "ai",
      visitorName: "Alice",
      visitorEmail: null,
      visitorPhone: null,
      leadId: null,
      messages: [makeMessage({ senderType: "CUSTOMER", body: "Hi" })],
    });

    const result = await getConversation("c1", "conv1");

    expect(result).not.toBeNull();
    expect(result!.messages[0].role).toBe("customer");
  });
});

// ── sweepChatEscalations ─────────────────────────────────────────────────────

describe("sweepChatEscalations", () => {
  it("skips conversations where the owner has already replied after escalation", async () => {
    const escalatedAt = new Date(NOW.getTime() - 10 * 60_000); // 10 min ago
    const lastOwnerAt = new Date(NOW.getTime() - 1 * 60_000); // 1 min ago (after escalation)
    prismaMock.conversation.findMany.mockResolvedValue([
      makeConv({ status: "escalated", escalatedAt, lastOwnerAt, nudgeCount: 0 }),
    ]);

    const { handed } = await sweepChatEscalations(NOW);

    expect(handed).toBe(0);
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
  });

  it("posts the first nudge at 30% of timeout", async () => {
    // 5 min timeout, 30% = 90s elapsed → first nudge
    const escalatedAt = new Date(NOW.getTime() - 95_000); // 95s elapsed > 90s threshold
    prismaMock.conversation.findMany.mockResolvedValue([
      makeConv({ id: "conv1", clientId: "c1", status: "escalated", escalatedAt, lastOwnerAt: null, nudgeCount: 0 }),
    ]);
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "AI" }));
    prismaMock.conversation.update.mockResolvedValue({});
    // getChatConfig is mocked to return 5 min timeout

    const { handed } = await sweepChatEscalations(NOW);

    expect(handed).toBe(1);
    expect(prismaMock.message.create).toHaveBeenCalled();
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nudgeCount: { increment: 1 } } }),
    );
  });

  it("hands off to lead (CLOSED) when visitor has contact info and timeout elapsed", async () => {
    const escalatedAt = new Date(NOW.getTime() - 6 * 60_000); // 6 min > 5 min timeout
    const conv = makeConv({
      id: "conv1", clientId: "c1", status: "escalated",
      escalatedAt, lastOwnerAt: null, nudgeCount: 2,
      visitorPhone: "+15551234567", visitorEmail: null, leadId: null,
      visitorName: "Bob", escalationNotifiedAt: new Date(),
    });
    prismaMock.conversation.findMany.mockResolvedValue([conv]);
    prismaMock.conversation.update.mockResolvedValue({ ...conv, timedOutAt: NOW });
    prismaMock.lead.create.mockResolvedValue({ id: "l1", clientId: "c1" });
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "AI" }));

    const { handed } = await sweepChatEscalations(NOW);

    expect(handed).toBe(1);
    expect(prismaMock.lead.create).toHaveBeenCalled();
    // Should close the conversation
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "closed" } }),
    );
  });

  it("sets status=awaiting_contact when timeout elapsed and no contact info", async () => {
    const escalatedAt = new Date(NOW.getTime() - 6 * 60_000);
    const conv = makeConv({
      id: "conv1", clientId: "c1", status: "escalated",
      escalatedAt, lastOwnerAt: null, nudgeCount: 2,
      visitorPhone: null, visitorEmail: null, leadId: null,
    });
    prismaMock.conversation.findMany.mockResolvedValue([conv]);
    prismaMock.conversation.update.mockResolvedValue({ ...conv, timedOutAt: NOW });
    prismaMock.message.create.mockResolvedValue(makeMessage({ senderType: "AI" }));

    const { handed } = await sweepChatEscalations(NOW);

    expect(handed).toBe(1);
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "awaiting_contact" } }),
    );
  });

  it("does not double-nudge (nudgeCount already at target)", async () => {
    const escalatedAt = new Date(NOW.getTime() - 95_000);
    prismaMock.conversation.findMany.mockResolvedValue([
      makeConv({ id: "conv1", clientId: "c1", status: "escalated", escalatedAt, lastOwnerAt: null, nudgeCount: 1 }),
    ]);
    // nudgeCount=1 means first nudge already sent; 95s is only enough for target=1 → no new nudge

    const { handed } = await sweepChatEscalations(NOW);

    expect(handed).toBe(0);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
