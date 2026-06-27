import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// Stable mock: use a plain class so vi.resetAllMocks() cannot clear the constructor behaviour.
// Only _mockCreate (the inner vi.fn) is subject to reset — tests re-set it per-test.
const _mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: _mockCreate };
  },
}));
vi.mock("@/lib/modules/usage", () => ({
  requireWithinLimit: vi.fn().mockResolvedValue(undefined),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  UsageError: class UsageError extends Error {},
}));
vi.mock("@/lib/modules/booking", () => ({
  getSchedulingSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/modules/booking/hours", () => ({
  isOpenNow: vi.fn().mockReturnValue(true),
  nextResponseEta: vi.fn().mockReturnValue(null),
}));

// facts module is NOT mocked — let it run against prismaMock. Its KB context
// comes from the knowledge module, which we stub so it stays out of the way.
vi.mock("@/lib/modules/knowledge", () => ({ buildKbContext: vi.fn() }));

import { chatTurn, holdingReply, ChatError } from "./orchestrator";
import { requireWithinLimit, recordUsage, UsageError } from "@/lib/modules/usage";
import { getSchedulingSettings } from "@/lib/modules/booking";
import { isOpenNow, nextResponseEta } from "@/lib/modules/booking/hours";
import { buildKbContext } from "@/lib/modules/knowledge";

// vi.resetAllMocks() clears all mock implementations between tests.
// Re-seed defaults that the module relies on (.catch()-safe promises) before each test.
beforeEach(() => {
  vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
  vi.mocked(recordUsage).mockResolvedValue(undefined);
  vi.mocked(getSchedulingSettings).mockResolvedValue({} as never);
  vi.mocked(isOpenNow).mockReturnValue(true);
  vi.mocked(nextResponseEta).mockReturnValue(null);
  vi.mocked(buildKbContext).mockResolvedValue("");
  process.env.ANTHROPIC_API_KEY = "test-key";
});

/** Helper: grab the underlying mock for anthropic.messages.create */
function getMockCreate() {
  return _mockCreate;
}

function makeToolBlock(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", input }],
  };
}

function seedFacts() {
  prismaMock.client.findUnique.mockResolvedValue({
    businessName: "Acme",
    businessType: null,
    ownerPhone: "+15551111111",
    ownerEmail: "owner@acme.com",
  });
  prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
  prismaMock.service.findMany.mockResolvedValue([]);
}

function seedPlanFlags(flags: Record<string, unknown> = { aiAssistant: true }) {
  prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: flags } });
}

describe("chatTurn", () => {
  it("returns an answer decision for a normal turn", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "We open at 9am.", intent: "answer" }));

    const result = await chatTurn("c1", [], "What time do you open?");

    expect(result.reply).toBe("We open at 9am.");
    expect(result.intent).toBe("answer");
    expect(result.escalationReason).toBeNull();
    expect(result.suggestCall).toBe(false);
  });

  it("returns book intent when the AI signals booking", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Sure, let me show slots.", intent: "book" }));

    const result = await chatTurn("c1", [], "I want to book");

    expect(result.intent).toBe("book");
    expect(result.escalationReason).toBeNull();
  });

  it("returns escalate intent with the given reason", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Let me check with the team.", intent: "escalate", escalation_reason: "CUSTOM_PRICING" }));

    const result = await chatTurn("c1", [], "Can you do a discount?");

    expect(result.intent).toBe("escalate");
    expect(result.escalationReason).toBe("CUSTOM_PRICING");
  });

  it("defaults escalationReason to UNKNOWN_TO_KB when reason is missing", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Team will follow up.", intent: "escalate" }));

    const result = await chatTurn("c1", [], "Who knows?");

    expect(result.escalationReason).toBe("UNKNOWN_TO_KB");
  });

  it("defaults escalationReason to UNKNOWN_TO_KB when reason is invalid", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Team will follow up.", intent: "escalate", escalation_reason: "TOTALLY_MADE_UP" }));

    const result = await chatTurn("c1", [], "?");

    expect(result.escalationReason).toBe("UNKNOWN_TO_KB");
  });

  it("uses the fallback reply when the AI returns an empty string", async () => {
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "", intent: "answer" }));

    const result = await chatTurn("c1", [], "Hi");

    expect(result.reply).toBeTruthy();
  });

  it("throws ChatError(403) when aiAssistant flag is off", async () => {
    seedFacts();
    seedPlanFlags({});

    await expect(chatTurn("c1", [], "hello")).rejects.toThrow(ChatError);
    await expect(chatTurn("c1", [], "hello")).rejects.toMatchObject({ status: 403, code: "ai_not_enabled" });
  });

  it("throws ChatError(429) when the usage limit is hit", async () => {
    seedFacts();
    seedPlanFlags();
    vi.mocked(requireWithinLimit).mockRejectedValue(new UsageError(429, "limit"));

    await expect(chatTurn("c1", [], "hello")).rejects.toMatchObject({ status: 429, code: "ai_limit_reached" });
  });

  it("throws ChatError(503) when ANTHROPIC_API_KEY is absent", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    seedFacts();
    seedPlanFlags();
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);

    try {
      await expect(chatTurn("c1", [], "hello")).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("throws ChatError(502) when the Anthropic API call throws", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockRejectedValue(new Error("network error"));

    await expect(chatTurn("c1", [], "hello")).rejects.toMatchObject({ status: 502, code: "ai_failed" });
  });

  it("parses contact info the visitor shared", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({
      reply: "The team will reach you.",
      intent: "escalate",
      escalation_reason: "UNKNOWN_TO_KB",
      contact: { name: "Alice", phone: "+15559999999" },
    }));

    const result = await chatTurn("c1", [], "Can you call me?");

    expect(result.contact).toEqual({ name: "Alice", phone: "+15559999999" });
  });

  it("returns undefined contact when the AI omits it", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Sure.", intent: "answer" }));

    const result = await chatTurn("c1", [], "What are your hours?");

    expect(result.contact).toBeUndefined();
  });

  it("sets suggestCall=true when escalating during business hours", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { isOpenNow } = await import("@/lib/modules/booking/hours");
    vi.mocked(isOpenNow).mockReturnValue(true);
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Team will help.", intent: "escalate", escalation_reason: "CUSTOM_PRICING" }));

    const result = await chatTurn("c1", [], "Can you match a competitor price?");

    expect(result.suggestCall).toBe(true);
  });

  it("sets suggestCall=false when escalating outside business hours", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { isOpenNow } = await import("@/lib/modules/booking/hours");
    vi.mocked(isOpenNow).mockReturnValue(false);
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Team will help.", intent: "escalate", escalation_reason: "CUSTOM_PRICING" }));

    const result = await chatTurn("c1", [], "Can you match a competitor price?");

    expect(result.suggestCall).toBe(false);
  });
});

describe("holdingReply", () => {
  it("returns a reply when the AI responds successfully", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "Thanks for waiting!", intent: "answer" }));

    const result = await holdingReply("c1", [], "Are you still there?");

    expect(result.reply).toBe("Thanks for waiting!");
  });

  it("returns { reply: null } when the AI call fails (fail-soft)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags({});  // no aiAssistant flag → ChatError 403
    getMockCreate().mockRejectedValue(new Error("unexpected"));

    const result = await holdingReply("c1", [], "hello");

    expect(result.reply).toBeNull();
  });

  it("returns { reply: null } when AI returns empty string", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({ reply: "   ", intent: "answer" }));

    const result = await holdingReply("c1", [], "hello");

    expect(result.reply).toBeNull();
  });

  it("parses contact info from the holding reply", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedFacts();
    seedPlanFlags();
    getMockCreate().mockResolvedValue(makeToolBlock({
      reply: "Perfect, I have your email.",
      intent: "answer",
      contact: { email: "visitor@example.com" },
    }));

    const result = await holdingReply("c1", [], "You can reach me at visitor@example.com");

    expect(result.contact).toEqual({ email: "visitor@example.com" });
  });
});
