import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  mintPlanAuthToken: vi.fn(),
  PaymentError: class PaymentError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { mintPlanAuthToken, PaymentError } from "@/lib/modules/payments";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };
const routeParams = { params: Promise.resolve({ id: "plan-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/finance/recurring/[id]/authorize-link", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1/authorize-link", { method: "POST" }),
      routeParams,
    );
    expect(res.status).toBe(401);
    expect(mintPlanAuthToken).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1/authorize-link", { method: "POST" }),
      routeParams,
    );
    expect(res.status).toBe(403);
  });

  it("returns PaymentError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(mintPlanAuthToken).mockRejectedValue(new PaymentError(404, "plan_not_found"));
    const res = await POST(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1/authorize-link", { method: "POST" }),
      routeParams,
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "plan_not_found" });
  });

  it("returns 200 with link on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const link = { url: "https://example.com/authorize/token-abc", expiresAt: "2026-07-01T00:00:00.000Z" };
    vi.mocked(mintPlanAuthToken).mockResolvedValue(link as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1/authorize-link", { method: "POST" }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(mintPlanAuthToken).toHaveBeenCalledWith("client-1", "plan-1");
    await expect(res.json()).resolves.toEqual(link);
  });
});
