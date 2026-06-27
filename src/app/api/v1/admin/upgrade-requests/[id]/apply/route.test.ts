import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/subscription", () => ({
  applyUpgradeRequest: vi.fn(),
  SubscriptionError: class SubscriptionError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { POST } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { applyUpgradeRequest, SubscriptionError } from "@/lib/modules/subscription";

const params = Promise.resolve({ id: "ur1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/upgrade-requests/[id]/apply", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/upgrade-requests/ur1/apply", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(applyUpgradeRequest).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/upgrade-requests/ur1/apply", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("applies upgrade request and returns ok on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(applyUpgradeRequest).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/upgrade-requests/ur1/apply", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(applyUpgradeRequest).toHaveBeenCalledWith("ur1", "u1");
  });

  it("returns SubscriptionError status on failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(applyUpgradeRequest).mockRejectedValue(new SubscriptionError(404, "request_not_found"));

    const req = new Request("http://localhost/api/v1/admin/upgrade-requests/ur1/apply", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("request_not_found");
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(applyUpgradeRequest).mockRejectedValue(new Error("database error"));

    const req = new Request("http://localhost/api/v1/admin/upgrade-requests/ur1/apply", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
  });
});
