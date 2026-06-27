import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  assertFeature: vi.fn(),
}));
vi.mock("@/lib/modules/payments", () => ({
  createPaymentLink: vi.fn(),
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
import { requireCapability } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { createPaymentLink, PaymentError } from "@/lib/modules/payments";

const makeCapability = (clientId = "c1") => ({
  client: { id: clientId, subscription: { plan: { featureFlags: { payments: true } } } },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/payments/payment-link", {
    method: "POST",
    body: JSON.stringify(body),
  });

const validBody = {
  amountCents: 5000,
  description: "Service fee",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/payments/payment-link", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("returns 403 when caller lacks finance capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("returns 403 when assertFeature throws (payments not in plan)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability() as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403, "feature_not_in_plan"); });

    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid amountCents (below minimum 50)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability() as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);

    const res = await POST(req({ ...validBody, amountCents: 10 }));
    expect(res.status).toBe(400);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("returns 400 when description is empty", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability() as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);

    const res = await POST(req({ ...validBody, description: "" }));
    expect(res.status).toBe(400);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("calls createPaymentLink with clientId from guard and integer cents — returns 201", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability("c-link") as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(createPaymentLink).mockResolvedValue({ url: "https://buy.stripe.com/abc", id: "plink_1" } as never);

    const res = await POST(req({ amountCents: 9900, description: "Consultation" }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ url: "https://buy.stripe.com/abc" });
    // Money must be integer cents — assert passed as-is to service
    expect(createPaymentLink).toHaveBeenCalledWith(
      "c-link",
      expect.objectContaining({ amountCents: 9900, description: "Consultation" }),
    );
  });

  it("returns PaymentError status on payment failure", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability() as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(createPaymentLink).mockRejectedValue(new PaymentError(422, "no_account"));

    const res = await POST(req(validBody));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "no_account" });
  });

  it("requireCapability is called with finance + manage", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCapability() as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(createPaymentLink).mockResolvedValue({ url: "https://buy.stripe.com/x" } as never);

    await POST(req(validBody));
    expect(requireCapability).toHaveBeenCalledWith("finance", "manage");
  });
});
