import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./preferences", () => ({
  suppressFromProvider: vi.fn(),
}));

import { verifyResendSignature, handleResendEvent } from "./tracking";
import { suppressFromProvider } from "./preferences";
import crypto from "node:crypto";

beforeEach(() => {
  vi.clearAllMocks();
});

// — verifyResendSignature -------------------------------------------------------

describe("verifyResendSignature", () => {
  it("returns true when no secret is set and not in production (dev mode)", () => {
    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;
    // NODE_ENV is 'test' in vitest
    const result = verifyResendSignature({ id: null, timestamp: null, signature: null }, "body");
    expect(result).toBe(true);
    if (originalSecret) process.env.RESEND_WEBHOOK_SECRET = originalSecret;
  });

  it("returns false when required headers are missing but secret is set", () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldA==";
    const result = verifyResendSignature({ id: null, timestamp: null, signature: null }, "body");
    expect(result).toBe(false);
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("returns false for a stale timestamp (> 5 min skew)", () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldA==";
    const staleTs = Math.floor(Date.now() / 1000) - 400; // 400s ago
    const result = verifyResendSignature(
      { id: "msg_123", timestamp: String(staleTs), signature: "v1,abc" },
      "body",
    );
    expect(result).toBe(false);
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("returns true for a valid HMAC signature", () => {
    const rawSecret = "testSecretBytes";
    const encoded = Buffer.from(rawSecret).toString("base64");
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${encoded}`;

    const id = "msg_valid";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"email.sent"}';
    const signedContent = `${id}.${timestamp}.${rawBody}`;
    const key = Buffer.from(rawSecret);
    const sig = crypto.createHmac("sha256", key).update(signedContent).digest("base64");

    const result = verifyResendSignature({ id, timestamp, signature: `v1,${sig}` }, rawBody);
    expect(result).toBe(true);
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("returns false for an invalid signature", () => {
    const rawSecret = "testSecretBytes";
    const encoded = Buffer.from(rawSecret).toString("base64");
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${encoded}`;

    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = verifyResendSignature(
      { id: "msg_x", timestamp, signature: "v1,invalidsignature" },
      "body",
    );
    expect(result).toBe(false);
    delete process.env.RESEND_WEBHOOK_SECRET;
  });
});

// — handleResendEvent -----------------------------------------------------------

const baseMockLog = {
  id: "log1",
  status: "SENT",
  campaignId: null,
  toEmail: "u@x.com",
  deliveredAt: null,
  openedAt: null,
  bouncedAt: null,
  complainedAt: null,
};

describe("handleResendEvent", () => {
  it("returns early when emailId is absent", async () => {
    await handleResendEvent({ type: "email.sent", data: {} });
    expect(prismaMock.emailLog.findFirst).not.toHaveBeenCalled();
  });

  it("returns early when no log row is found for the providerId", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue(null);
    await handleResendEvent({ type: "email.sent", data: { email_id: "resend-id" } });
    expect(prismaMock.emailLog.update).not.toHaveBeenCalled();
  });

  it("updates status to DELIVERED and increments campaign counter", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog, campaignId: "camp1" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    prismaMock.emailCampaign.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.delivered", created_at: "2024-01-01T00:00:00Z", data: { email_id: "rid" } });

    expect(prismaMock.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DELIVERED" }) }),
    );
    expect(prismaMock.emailCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "camp1" }, data: { deliveredCount: { increment: 1 } } }),
    );
  });

  it("does NOT update deliveredAt a second time (idempotent)", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog, deliveredAt: new Date() } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.delivered", data: { email_id: "rid" } });

    const call = (prismaMock.emailLog.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.deliveredAt).toBeUndefined();
  });

  it("increments openCount on every open and sets openedAt on first open", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.opened", data: { email_id: "rid" } });

    const call = (prismaMock.emailLog.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.openCount).toEqual({ increment: 1 });
    expect(call.data.openedAt).toBeDefined();
  });

  it("suppresses from provider on bounce and marks log BOUNCED", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.bounced", data: { email_id: "rid" } });

    expect(suppressFromProvider).toHaveBeenCalledWith("u@x.com", "bounce");
    const call = (prismaMock.emailLog.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.status).toBe("BOUNCED");
  });

  it("suppresses from provider on complaint", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.complained", data: { email_id: "rid" } });
    expect(suppressFromProvider).toHaveBeenCalledWith("u@x.com", "complaint");
  });

  it("does not downgrade status (late delivered after opened)", async () => {
    // Log is already OPENED; a late delivered event should not downgrade to DELIVERED
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog, status: "OPENED", deliveredAt: new Date() } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);

    await handleResendEvent({ type: "email.delivered", data: { email_id: "rid" } });

    const call = (prismaMock.emailLog.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // status should NOT be set to DELIVERED (already OPENED which is higher rank)
    expect(call.data.status).toBeUndefined();
  });

  it("ignores unknown event types (no update)", async () => {
    prismaMock.emailLog.findFirst.mockResolvedValue({ ...baseMockLog } as never);
    await handleResendEvent({ type: "email.delivery_delayed", data: { email_id: "rid" } });
    expect(prismaMock.emailLog.update).not.toHaveBeenCalled();
  });
});
