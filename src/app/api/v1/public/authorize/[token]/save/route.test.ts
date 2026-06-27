import { describe, it, expect, vi, beforeEach } from "vitest";

const { PaymentError } = vi.hoisted(() => ({
  PaymentError: class PaymentError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/payments", () => ({ savePlanCard: vi.fn(), PaymentError }));

import { POST } from "./route";
import { savePlanCard } from "@/lib/modules/payments";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/authorize/tk/save", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/authorize/{token}/save", () => {
  it("400 on validation failure (missing fields)", async () => {
    const res = await POST(req({}), ctx);
    expect(res.status).toBe(400);
    expect(savePlanCard).not.toHaveBeenCalled();
  });

  it("maps PaymentError to its status/code", async () => {
    vi.mocked(savePlanCard).mockRejectedValue(new PaymentError("bad_token", 404));
    const res = await POST(req({ setupIntentId: "si_1", mandateText: "I agree" }), ctx);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "bad_token" });
  });

  it("happy path: persists card with token + ip and returns ok", async () => {
    vi.mocked(savePlanCard).mockResolvedValue(undefined as never);
    const res = await POST(req({ setupIntentId: "si_1", mandateText: "I agree" }), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(savePlanCard).toHaveBeenCalledWith("tk", {
      setupIntentId: "si_1",
      mandateText: "I agree",
      ip: "1.2.3.4",
    });
  });
});
