import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/test/setup";

// Stable mock: MockAnthropic is a plain function (not vi.fn) so vi.resetAllMocks()
// cannot clear its constructor behaviour. Only mockCreate (the inner vi.fn) is reset.
const _mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  // Reference captured above; the constructor always returns an instance with the same fn.
  return {
    default: class MockAnthropic {
      messages = { create: _mockCreate };
    },
  };
});
vi.mock("@/lib/modules/usage", () => ({
  requireWithinLimit: vi.fn().mockResolvedValue(undefined),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  UsageError: class UsageError extends Error {},
}));
vi.mock("@/lib/sms/twilio", () => ({
  sendProviderSms: vi.fn(),
}));
vi.mock("@/lib/modules/email", () => ({
  sendEmail: vi.fn(),
}));

import { sendAiReply, sendSms, sendClientEmail, MessagingError } from "./service";
import { requireWithinLimit, recordUsage, UsageError } from "@/lib/modules/usage";
import { sendProviderSms } from "@/lib/sms/twilio";
import { sendEmail } from "@/lib/modules/email";

function getMockCreate() {
  return _mockCreate;
}

function seedPlanFlags(flags: Record<string, unknown>) {
  prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: flags } });
}

// vi.resetAllMocks() (in setup.ts) clears all mock implementations between tests.
// Re-seed the defaults that modules rely on (.catch()-safe promises) before each test.
let savedApiKey: string | undefined;
beforeEach(() => {
  savedApiKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  // recordUsage is called with .catch(() => {}) in sendSms; must return a real Promise.
  vi.mocked(recordUsage).mockResolvedValue(undefined);
  vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
});
afterEach(() => {
  if (savedApiKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = savedApiKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

// ── sendAiReply ───────────────────────────────────────────────────────────────

describe("sendAiReply", () => {
  it("throws MessagingError(403) when aiAssistant flag is off", async () => {
    seedPlanFlags({});

    await expect(sendAiReply("c1", "hello")).rejects.toMatchObject({ status: 403, code: "ai_not_enabled" });
  });

  it("throws MessagingError(429) when usage limit is hit", async () => {
    seedPlanFlags({ aiAssistant: true });
    vi.mocked(requireWithinLimit).mockRejectedValue(new UsageError(429, "limit"));

    await expect(sendAiReply("c1", "hello")).rejects.toMatchObject({ status: 429, code: "ai_limit_reached" });
  });

  it("throws MessagingError(503) when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY; // beforeEach sets it; override for this test
    seedPlanFlags({ aiAssistant: true });
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);

    await expect(sendAiReply("c1", "hello")).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
    // afterEach will restore it
  });

  it("throws MessagingError(502) when the Anthropic API call fails", async () => {
    seedPlanFlags({ aiAssistant: true });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme", businessType: null, ownerPhone: null, ownerEmail: null });
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);
    getMockCreate().mockRejectedValue(new Error("Anthropic error"));

    await expect(sendAiReply("c1", "hello")).rejects.toMatchObject({ status: 502, code: "ai_failed" });
  });

  it("returns an AI reply and records usage on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    seedPlanFlags({ aiAssistant: true });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme", businessType: "Plumbing", ownerPhone: null, ownerEmail: null });
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);
    getMockCreate().mockResolvedValue({ content: [{ type: "text", text: "We open at 9am." }] });

    const result = await sendAiReply("c1", "What time do you open?");

    expect(result.reply).toBe("We open at 9am.");
    expect(recordUsage).toHaveBeenCalledWith("c1", "aiReplies");
  });

  it("returns fallback reply when AI returns empty text", async () => {
    seedPlanFlags({ aiAssistant: true });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme", businessType: null, ownerPhone: null, ownerEmail: null });
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);
    getMockCreate().mockResolvedValue({ content: [{ type: "text", text: "" }] });

    const result = await sendAiReply("c1", "hi");

    expect(result.reply).toBeTruthy();
    expect(result.reply).toContain("not sure");
  });

  it("passes conversation history to the model (last 8 turns)", async () => {
    seedPlanFlags({ aiAssistant: true });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "B", businessType: null, ownerPhone: null, ownerEmail: null });
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);
    getMockCreate().mockResolvedValue({ content: [{ type: "text", text: "Answer." }] });

    const history = [
      { role: "user" as const, content: "Turn 1" },
      { role: "assistant" as const, content: "Reply 1" },
    ];
    await sendAiReply("c1", "New question", history);

    const call = getMockCreate().mock.calls[0][0] as { messages: unknown[] };
    expect(call.messages).toContainEqual({ role: "user", content: "Turn 1" });
    expect(call.messages).toContainEqual({ role: "user", content: "New question" });
  });
});

// ── sendSms ───────────────────────────────────────────────────────────────────

describe("sendSms", () => {
  it("throws MessagingError(403) when smsAlerts flag is off", async () => {
    seedPlanFlags({});

    await expect(sendSms("c1", "+15551234567", "hello")).rejects.toMatchObject({ status: 403, code: "sms_not_enabled" });
  });

  it("throws MessagingError(400) for an invalid phone number", async () => {
    seedPlanFlags({ smsAlerts: true });

    await expect(sendSms("c1", "bad", "hello")).rejects.toMatchObject({ status: 400, code: "invalid_phone" });
  });

  it("returns suppressed status without sending when number is opted out", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue({ id: "opt1" });
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });

    const result = await sendSms("c1", "+15551234567", "hello");

    expect(result.status).toBe("suppressed");
    expect(sendProviderSms).not.toHaveBeenCalled();
  });

  it("logs a FAILED record (error=suppressed:opted_out) for opted-out numbers", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue({ id: "opt1" });
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });

    await sendSms("c1", "+15551234567", "hello");

    expect(prismaMock.smsLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: "suppressed:opted_out" }) }),
    );
  });

  it("throws MessagingError(429) when SMS usage limit is hit", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockRejectedValue(new UsageError(429, "limit"));

    await expect(sendSms("c1", "+15551234567", "hello")).rejects.toMatchObject({ status: 429, code: "sms_limit_reached" });
  });

  it("appends STOP footer when body doesn't already contain it", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockResolvedValue({ sid: "SM123", stubbed: false });

    await sendSms("c1", "+15551234567", "Hello there");

    const createCall = prismaMock.smsLog.create.mock.calls[0][0] as { data: { body: string } };
    expect(createCall.data.body).toContain("STOP");
  });

  it("does NOT double-append STOP footer when body already has it", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockResolvedValue({ sid: "SM123", stubbed: false });

    await sendSms("c1", "+15551234567", "Hello\n\nReply STOP to opt out.");

    const createCall = prismaMock.smsLog.create.mock.calls[0][0] as { data: { body: string } };
    const stopCount = (createCall.data.body.match(/STOP/g) ?? []).length;
    expect(stopCount).toBe(1);
  });

  it("returns 'sent' and records usage on a real send", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockResolvedValue({ sid: "SM123", stubbed: false });

    const result = await sendSms("c1", "+15551234567", "hi");

    expect(result.status).toBe("sent");
    expect(result.to).toBe("+15551234567");
    expect(recordUsage).toHaveBeenCalledWith("c1", "sms");
  });

  it("returns 'stubbed' and does NOT record usage for a stubbed send", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockResolvedValue({ sid: null, stubbed: true });

    const result = await sendSms("c1", "+15551234567", "hi");

    expect(result.status).toBe("stubbed");
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("throws MessagingError(502) and updates log to FAILED when provider throws", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockRejectedValue(new Error("Twilio error"));

    await expect(sendSms("c1", "+15551234567", "hi")).rejects.toMatchObject({ status: 502, code: "sms_failed" });

    expect(prismaMock.smsLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("records consentVerified on the log row", async () => {
    seedPlanFlags({ smsAlerts: true });
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.smsLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.smsLog.update.mockResolvedValue({} as never);
    vi.mocked(sendProviderSms).mockResolvedValue({ sid: "SM123", stubbed: false });

    await sendSms("c1", "+15551234567", "hi", { consentVerified: true });

    expect(prismaMock.smsLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consentVerified: true }) }),
    );
  });
});

// ── sendClientEmail ───────────────────────────────────────────────────────────

describe("sendClientEmail", () => {
  it("records email usage and delegates to sendEmail", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ id: "e1", stubbed: false });

    const result = await sendClientEmail("c1", { to: "user@x.com", subject: "Hello", html: "<p>Hi</p>" });

    expect(recordUsage).toHaveBeenCalledWith("c1", "email");
    expect(sendEmail).toHaveBeenCalledWith({ to: "user@x.com", subject: "Hello", html: "<p>Hi</p>" });
    expect(result).toEqual({ id: "e1", stubbed: false });
  });

  it("still sends even when recordUsage throws (transactional email is not hard-blocked)", async () => {
    vi.mocked(recordUsage).mockRejectedValue(new Error("usage error"));
    vi.mocked(sendEmail).mockResolvedValue({ id: null, stubbed: true });

    const result = await sendClientEmail("c1", { to: "user@x.com", subject: "Hi", html: "<p>Hi</p>" });

    // recordUsage throws but the .catch() absorbs it — sendEmail still runs
    expect(sendEmail).toHaveBeenCalled();
    expect(result.stubbed).toBe(true);
  });
});
