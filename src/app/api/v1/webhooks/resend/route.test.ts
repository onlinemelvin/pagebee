import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/email/tracking", () => ({
  verifyResendSignature: vi.fn(),
  handleResendEvent: vi.fn(),
}));

import { POST } from "./route";
import { verifyResendSignature, handleResendEvent } from "@/lib/modules/email/tracking";

const SVIX_HEADERS = {
  "svix-id": "msg_123",
  "svix-timestamp": "1234567890",
  "svix-signature": "v1,abc123",
};

function makeReq(opts: { headers?: Record<string, string>; body?: string } = {}) {
  return new Request("http://localhost/api/v1/webhooks/resend", {
    method: "POST",
    headers: opts.headers ?? SVIX_HEADERS,
    body: opts.body ?? JSON.stringify({ type: "email.sent", data: {} }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/webhooks/resend", () => {
  it("returns 400 when signature verification fails", async () => {
    vi.mocked(verifyResendSignature).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_signature" });
    expect(handleResendEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    vi.mocked(verifyResendSignature).mockReturnValue(true);
    const res = await POST(makeReq({ body: "not-json" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_payload" });
    expect(handleResendEvent).not.toHaveBeenCalled();
  });

  it("passes svix headers to verifyResendSignature", async () => {
    vi.mocked(verifyResendSignature).mockReturnValue(true);
    vi.mocked(handleResendEvent).mockResolvedValue(undefined as never);
    const body = JSON.stringify({ type: "email.bounced" });

    await POST(makeReq({ body }));
    expect(verifyResendSignature).toHaveBeenCalledWith(
      { id: "msg_123", timestamp: "1234567890", signature: "v1,abc123" },
      body,
    );
  });

  it("returns 200 and calls handleResendEvent with parsed event on success", async () => {
    vi.mocked(verifyResendSignature).mockReturnValue(true);
    vi.mocked(handleResendEvent).mockResolvedValue(undefined as never);
    const event = { type: "email.sent", data: { email_id: "e1" } };

    const res = await POST(makeReq({ body: JSON.stringify(event) }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ received: true });
    expect(handleResendEvent).toHaveBeenCalledWith(event);
  });

  it("returns 500 when handleResendEvent throws", async () => {
    vi.mocked(verifyResendSignature).mockReturnValue(true);
    vi.mocked(handleResendEvent).mockRejectedValue(new Error("db error"));

    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "processing_error" });
  });
});
