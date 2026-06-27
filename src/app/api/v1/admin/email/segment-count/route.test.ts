import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({
  segmentCount: vi.fn(),
  segmentSchema: {
    safeParse: vi.fn(),
  },
}));

import { POST } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { segmentCount, segmentSchema } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/email/segment-count", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/segment-count", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(segmentCount).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/email/segment-count", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(segmentSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/email/segment-count", {
      method: "POST",
      body: JSON.stringify({ plans: ["INVALID"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns segment count on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(segmentSchema.safeParse).mockReturnValue({
      success: true,
      data: { plans: ["NECTAR"] },
    } as never);
    vi.mocked(segmentCount).mockResolvedValue(123 as never);

    const req = new Request("http://localhost/api/v1/admin/email/segment-count", {
      method: "POST",
      body: JSON.stringify({ plans: ["NECTAR"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ count: 123 });
    expect(segmentCount).toHaveBeenCalledWith({ plans: ["NECTAR"] });
  });
});
