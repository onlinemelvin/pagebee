import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/subscription", () => ({
  requestUpgrade: vi.fn(),
  SubscriptionError: class SubscriptionError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));
vi.mock("@/lib/modules/billing", () => ({
  upgradeSubscription: vi.fn(),
  BillingError: class BillingError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({ capture: vi.fn() })),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { requestUpgrade, SubscriptionError } from "@/lib/modules/subscription";
import { upgradeSubscription, BillingError } from "@/lib/modules/billing";
import { stripeConfigured } from "@/lib/stripe/client";
import { getPostHogClient } from "@/lib/posthog-server";

const mockCtx = { userId: "user-1" };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/v1/client/subscription/upgrade", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // re-apply factory default wiped by vi.resetAllMocks() in global setup
  vi.mocked(getPostHogClient).mockReturnValue({ capture: vi.fn() } as never);
});

describe("POST /api/v1/client/subscription/upgrade", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(makeReq({ toPlan: "HONEY" }));
    expect(res.status).toBe(401);
    expect(requestUpgrade).not.toHaveBeenCalled();
    expect(upgradeSubscription).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(makeReq({ toPlan: "HONEY" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when toPlan is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_plan" });
  });

  it("returns 400 when toPlan is not a string", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    const res = await POST(makeReq({ toPlan: 42 }));
    expect(res.status).toBe(400);
  });

  it("calls requestUpgrade for test account (bypasses Stripe)", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: true }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(false);
    vi.mocked(requestUpgrade).mockResolvedValue({ applied: true } as never);
    const res = await POST(makeReq({ toPlan: "HIVE" }));
    expect(res.status).toBe(200);
    expect(requestUpgrade).toHaveBeenCalledWith("c1", "HIVE", undefined);
    expect(upgradeSubscription).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("calls requestUpgrade when Stripe is not configured", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(false);
    vi.mocked(requestUpgrade).mockResolvedValue({ pending: true } as never);
    const res = await POST(makeReq({ toPlan: "HONEY", reason: "More features" }));
    expect(res.status).toBe(200);
    expect(requestUpgrade).toHaveBeenCalledWith("c1", "HONEY", "More features");
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("calls upgradeSubscription and returns checkoutUrl when Stripe configured + not subscribed", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    vi.mocked(upgradeSubscription).mockResolvedValue({ url: "https://checkout.stripe.com/session" } as never);
    const res = await POST(makeReq({ toPlan: "HIVE" }));
    expect(res.status).toBe(200);
    expect(upgradeSubscription).toHaveBeenCalledWith("c1", "HIVE");
    await expect(res.json()).resolves.toEqual({ ok: true, checkoutUrl: "https://checkout.stripe.com/session" });
  });

  it("returns applied=true when Stripe inline upgrade succeeds", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    // No url property = inline upgrade applied
    vi.mocked(upgradeSubscription).mockResolvedValue({ applied: true } as never);
    const res = await POST(makeReq({ toPlan: "HIVE" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, applied: true });
  });

  it("returns SubscriptionError status", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(false);
    vi.mocked(requestUpgrade).mockRejectedValue(new SubscriptionError(409, "already_on_plan"));
    const res = await POST(makeReq({ toPlan: "HIVE" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_on_plan" });
  });

  it("returns BillingError status", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: false }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(true);
    vi.mocked(upgradeSubscription).mockRejectedValue(new BillingError(402, "payment_failed"));
    const res = await POST(makeReq({ toPlan: "HIVE" }));
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ error: "payment_failed" });
  });

  it("calls requireOwner with allowInactive=true", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: { id: "c1", isTest: true }, ctx: mockCtx } as never);
    vi.mocked(stripeConfigured).mockReturnValue(false);
    vi.mocked(requestUpgrade).mockResolvedValue({} as never);
    await POST(makeReq({ toPlan: "HIVE" }));
    expect(requireOwner).toHaveBeenCalledWith({ allowInactive: true });
  });
});
