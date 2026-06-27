import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
  getStripe: vi.fn(),
}));
vi.mock("@/lib/modules/payments", () => ({
  processStripeEvent: vi.fn(),
}));

import { POST } from "./route";
import { stripeConfigured, getStripe } from "@/lib/stripe/client";
import { processStripeEvent } from "@/lib/modules/payments";

const FAKE_SECRET = "whsec_test";
const FAKE_SIG = "t=1,v1=abc";
const FAKE_EVENT = { id: "evt_1", type: "payment_intent.succeeded", data: {} };

function makeReq(opts: { sig?: string | null; body?: string } = {}) {
  const sig = opts.sig === undefined ? FAKE_SIG : opts.sig;
  const headers: Record<string, string> = {};
  if (sig !== null) headers["stripe-signature"] = sig;
  return new Request("http://localhost/api/v1/webhooks/stripe", {
    method: "POST",
    headers,
    body: opts.body ?? '{"type":"payment_intent.succeeded"}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = FAKE_SECRET;
});

describe("POST /api/v1/webhooks/stripe", () => {
  it("returns 503 when stripe is not configured", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("returns 503 when STRIPE_WEBHOOK_SECRET is missing", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const res = await POST(makeReq({ sig: null }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_signature" });
  });

  it("returns 400 when signature verification fails", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const mockStripe = { webhooks: { constructEvent: vi.fn().mockImplementation(() => { throw new Error("bad sig"); }) } };
    vi.mocked(getStripe).mockReturnValue(mockStripe as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_signature" });
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("returns 200 and calls processStripeEvent on valid signature", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const mockStripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(FAKE_EVENT) } };
    vi.mocked(getStripe).mockReturnValue(mockStripe as never);
    vi.mocked(processStripeEvent).mockResolvedValue(undefined as never);

    const res = await POST(makeReq({ body: "raw-body" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ received: true });
    expect(processStripeEvent).toHaveBeenCalledWith(FAKE_EVENT);
  });

  it("returns 500 when processStripeEvent throws", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const mockStripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(FAKE_EVENT) } };
    vi.mocked(getStripe).mockReturnValue(mockStripe as never);
    vi.mocked(processStripeEvent).mockRejectedValue(new Error("db error"));

    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "processing_error" });
  });
});
