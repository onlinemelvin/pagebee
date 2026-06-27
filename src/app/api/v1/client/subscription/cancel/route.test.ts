import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  BillingError: class BillingError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { cancelSubscription, reactivateSubscription, BillingError } from "@/lib/modules/billing";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/v1/client/subscription/cancel", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/subscription/cancel", () => {
  it("returns 400 when body fails schema validation", async () => {
    // action must be "cancel" | "reactivate"; passing a bad value should fail
    const res = await POST(new Request("http://localhost/api/v1/client/subscription/cancel", {
      method: "POST",
      body: JSON.stringify({ action: "invalid_action" }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(requireOwner).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated (cancel)", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(makeReq({ action: "cancel" }));
    expect(res.status).toBe(401);
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(makeReq({ action: "cancel" }));
    expect(res.status).toBe(403);
  });

  it("cancels subscription gracefully by default", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const result = { canceledAt: null, endsAt: "2026-07-26" };
    vi.mocked(cancelSubscription).mockResolvedValue(result as never);
    const res = await POST(makeReq({ action: "cancel" }));
    expect(res.status).toBe(200);
    expect(cancelSubscription).toHaveBeenCalledWith("client-1", { immediate: undefined });
    await expect(res.json()).resolves.toEqual(result);
  });

  it("cancels subscription immediately when immediate=true", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const result = { canceledAt: "2026-06-26", endsAt: "2026-06-26" };
    vi.mocked(cancelSubscription).mockResolvedValue(result as never);
    const res = await POST(makeReq({ action: "cancel", immediate: true }));
    expect(res.status).toBe(200);
    expect(cancelSubscription).toHaveBeenCalledWith("client-1", { immediate: true });
  });

  it("reactivates subscription when action=reactivate", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const result = { reactivated: true };
    vi.mocked(reactivateSubscription).mockResolvedValue(result as never);
    const res = await POST(makeReq({ action: "reactivate" }));
    expect(res.status).toBe(200);
    expect(reactivateSubscription).toHaveBeenCalledWith("client-1");
    expect(cancelSubscription).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual(result);
  });

  it("calls requireOwner with allowInactive=true when reactivating", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(reactivateSubscription).mockResolvedValue({} as never);
    await POST(makeReq({ action: "reactivate" }));
    expect(requireOwner).toHaveBeenCalledWith({ allowInactive: true });
  });

  it("calls requireOwner without allowInactive when canceling", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(cancelSubscription).mockResolvedValue({} as never);
    await POST(makeReq({ action: "cancel" }));
    expect(requireOwner).toHaveBeenCalledWith(undefined);
  });

  it("returns BillingError status from service", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(cancelSubscription).mockRejectedValue(new BillingError(409, "already_canceled"));
    const res = await POST(makeReq({ action: "cancel" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_canceled" });
  });
});
