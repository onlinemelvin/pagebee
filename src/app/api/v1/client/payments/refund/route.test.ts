import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  refundPayment: vi.fn(),
  PaymentError: class PaymentError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { refundPayment, PaymentError } from "@/lib/modules/payments";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/payments/refund", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/payments/refund", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ paymentId: "pi_abc" }));
    expect(res.status).toBe(401);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({ paymentId: "pi_abc" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when paymentId is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "paymentId_required" });
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/payments/refund", { method: "POST", body: "bad" }),
    );
    expect(res.status).toBe(400);
  });

  it("calls refundPayment with clientId from guard and returns refund", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-refund") as never);
    vi.mocked(refundPayment).mockResolvedValue({ id: "re_1", amountCents: 5000 } as never);

    const res = await POST(req({ paymentId: "pi_xyz" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ refund: { id: "re_1", amountCents: 5000 } });
    // amountCents is integer cents — assert passed through correctly
    expect(refundPayment).toHaveBeenCalledWith("c-refund", "pi_xyz", undefined);
  });

  it("passes partial amount as integer cents to refundPayment", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-partial") as never);
    vi.mocked(refundPayment).mockResolvedValue({ id: "re_2", amountCents: 2500 } as never);

    await POST(req({ paymentId: "pi_xyz", amount: 2500 }));
    expect(refundPayment).toHaveBeenCalledWith("c-partial", "pi_xyz", 2500);
  });

  it("returns PaymentError status on payment failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(refundPayment).mockRejectedValue(new PaymentError(409, "already_refunded"));

    const res = await POST(req({ paymentId: "pi_xyz" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_refunded" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(refundPayment).mockRejectedValue(new Error("unexpected"));

    const res = await POST(req({ paymentId: "pi_xyz" }));
    expect(res.status).toBe(500);
  });
});
