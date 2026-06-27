import { describe, it, expect, vi, beforeEach } from "vitest";

const { PaymentError } = vi.hoisted(() => ({
  PaymentError: class PaymentError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/payments", () => ({ createPlanSetupIntent: vi.fn(), PaymentError }));

import { POST } from "./route";
import { createPlanSetupIntent } from "@/lib/modules/payments";

const req = () =>
  new Request("http://localhost/api/v1/public/authorize/tk/setup-intent", { method: "POST" });
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/authorize/{token}/setup-intent", () => {
  it("maps PaymentError to its status/code", async () => {
    vi.mocked(createPlanSetupIntent).mockRejectedValue(new PaymentError("bad_token", 404));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "bad_token" });
  });

  it("500 on an unexpected error", async () => {
    vi.mocked(createPlanSetupIntent).mockRejectedValue(new Error("boom"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
  });

  it("happy path: returns the intent for the token", async () => {
    vi.mocked(createPlanSetupIntent).mockResolvedValue({ clientSecret: "cs_1" } as never);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientSecret: "cs_1" });
    expect(createPlanSetupIntent).toHaveBeenCalledWith("tk");
  });
});
