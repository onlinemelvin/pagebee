import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
  getStripe: vi.fn(),
}));
vi.mock("@/lib/modules/billing", () => ({
  processBillingEvent: vi.fn(),
}));

import { POST } from "./route";
import { stripeConfigured, getStripe } from "@/lib/stripe/client";
import { processBillingEvent } from "@/lib/modules/billing";

const FAKE_SECRET = "whsec_billing_test";
const FAKE_SIG = "t=1,v1=abc";
const FAKE_EVENT = { id: "evt_2", type: "customer.subscription.updated", data: {} };

function makeReq(opts: { sig?: string | null; body?: string } = {}) {
  const sig = opts.sig === undefined ? FAKE_SIG : opts.sig;
  const headers: Record<string, string> = {};
  if (sig !== null) headers["stripe-signature"] = sig;
  return new Request("http://localhost/api/v1/webhooks/stripe-billing", {
    method: "POST",
    headers,
    body: opts.body ?? '{"type":"customer.subscription.updated"}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = FAKE_SECRET;
});

describe("POST /api/v1/webhooks/stripe-billing", () => {
  it("returns 503 when stripe is not configured", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it("returns 503 when STRIPE_BILLING_WEBHOOK_SECRET is missing", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
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
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it("returns 200 and calls processBillingEvent on valid signature", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const mockStripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(FAKE_EVENT) } };
    vi.mocked(getStripe).mockReturnValue(mockStripe as never);
    vi.mocked(processBillingEvent).mockResolvedValue(undefined as never);

    const res = await POST(makeReq({ body: "raw-body" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ received: true });
    expect(processBillingEvent).toHaveBeenCalledWith(FAKE_EVENT);
  });

  it("returns 500 when processBillingEvent throws", async () => {
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const mockStripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(FAKE_EVENT) } };
    vi.mocked(getStripe).mockReturnValue(mockStripe as never);
    vi.mocked(processBillingEvent).mockRejectedValue(new Error("db error"));

    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "processing_error" });
  });
});
