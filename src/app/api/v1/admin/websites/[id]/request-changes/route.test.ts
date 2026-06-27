import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  requestReviewChanges: vi.fn(),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { requestReviewChanges } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/websites/[id]/request-changes", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/request-changes", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(requestReviewChanges).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/request-changes", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when result is not ok", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(requestReviewChanges).mockResolvedValue({ ok: false, reason: "no_open_pins" } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/request-changes", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no_open_pins");
  });

  it("returns result on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    const mockResult = { ok: true, jobId: "j1", versionId: "v2" };
    vi.mocked(requestReviewChanges).mockResolvedValue(mockResult as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/request-changes", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(mockResult);
    expect(requestReviewChanges).toHaveBeenCalledWith("v1", "u1");
  });

  it("returns 404 on thrown error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(requestReviewChanges).mockRejectedValue(new Error("version not found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/request-changes", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
