import { describe, it, expect, vi, beforeEach } from "vitest";

const { PaymentError } = vi.hoisted(() => ({
  PaymentError: class PaymentError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/payments", () => ({ createInvoicePaymentIntent: vi.fn(), PaymentError }));

import { POST } from "./route";
import { createInvoicePaymentIntent } from "@/lib/modules/payments";

const req = (body: unknown = {}) =>
  new Request("http://localhost/api/v1/public/finance/tk/payment-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/finance/{token}/payment-intent", () => {
  it("maps PaymentError to its status/code", async () => {
    vi.mocked(createInvoicePaymentIntent).mockRejectedValue(new PaymentError("paid", 409));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "paid" });
  });

  it("happy path: returns the intent, passes the deposit flag", async () => {
    vi.mocked(createInvoicePaymentIntent).mockResolvedValue({ clientSecret: "cs" } as never);
    const res = await POST(req({ deposit: true }), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientSecret: "cs" });
    expect(createInvoicePaymentIntent).toHaveBeenCalledWith("tk", { deposit: true });
  });
});
