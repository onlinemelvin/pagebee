import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  createBillingCheckout: vi.fn(),
  BillingError: class BillingError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
}));
const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: posthogCapture }),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { createBillingCheckout, BillingError } from "@/lib/modules/billing";
import { stripeConfigured } from "@/lib/stripe/client";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId, isTest: false },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/checkout", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ kind: "setup" }));
    expect(res.status).toBe(401);
    expect(createBillingCheckout).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({ kind: "setup" }));
    expect(res.status).toBe(403);
  });

  it("returns 503 when Stripe is not configured", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(stripeConfigured).mockReturnValue(false);
    const res = await POST(req({ kind: "setup" }));
    expect(res.status).toBe(503);
    expect(createBillingCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid kind", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const res = await POST(req({ kind: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    const res = await POST(new Request("http://localhost/api/v1/client/billing/checkout", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
  });

  it("calls createBillingCheckout with clientId from guard (not body) and returns url", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("client-42") as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    vi.mocked(createBillingCheckout).mockResolvedValue({ url: "https://stripe.com/pay/abc" } as never);

    const res = await POST(req({ kind: "upgrade", toPlan: "HIVE" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://stripe.com/pay/abc" });
    expect(createBillingCheckout).toHaveBeenCalledWith("client-42", "upgrade", "HIVE");
  });

  it("returns BillingError status and code on billing failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    vi.mocked(createBillingCheckout).mockRejectedValue(new BillingError(422, "no_subscription"));

    const res = await POST(req({ kind: "setup" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "no_subscription" });
  });
});
