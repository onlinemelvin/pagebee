import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  refreshAccountStatus: vi.fn(),
  getPaymentStatus: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { refreshAccountStatus, getPaymentStatus } from "@/lib/modules/payments";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/payments/refresh", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(refreshAccountStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("calls refreshAccountStatus and getPaymentStatus with clientId from guard", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-refresh") as never);
    vi.mocked(refreshAccountStatus).mockResolvedValue(undefined as never);
    vi.mocked(getPaymentStatus).mockResolvedValue({ mode: "custom", state: "active" } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: { mode: "custom", state: "active" } });
    expect(refreshAccountStatus).toHaveBeenCalledWith("c-refresh");
    expect(getPaymentStatus).toHaveBeenCalledWith("c-refresh");
  });

  it("still returns status even when refreshAccountStatus throws (fail-soft)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-fail") as never);
    vi.mocked(refreshAccountStatus).mockRejectedValue(new Error("stripe error"));
    vi.mocked(getPaymentStatus).mockResolvedValue({ mode: "none", state: "pending" } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: { mode: "none", state: "pending" } });
    expect(getPaymentStatus).toHaveBeenCalledWith("c-fail");
  });
});
