import { describe, it, expect, vi, beforeEach } from "vitest";

const { PaymentError } = vi.hoisted(() => ({
  PaymentError: class PaymentError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/payments", () => ({ createInvoiceCheckout: vi.fn(), PaymentError }));

import { POST } from "./route";
import { createInvoiceCheckout } from "@/lib/modules/payments";

const req = (body: unknown = {}) =>
  new Request("http://localhost/api/v1/public/finance/tk/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/finance/{token}/checkout", () => {
  it("maps PaymentError to its status/code", async () => {
    vi.mocked(createInvoiceCheckout).mockRejectedValue(new PaymentError("not_found", 404));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("happy path: returns the checkout url, passes the deposit flag", async () => {
    vi.mocked(createInvoiceCheckout).mockResolvedValue("https://pay" as never);
    const res = await POST(req({ deposit: true }), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://pay" });
    expect(createInvoiceCheckout).toHaveBeenCalledWith("tk", { deposit: true });
  });
});
