import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  revertToVersion: vi.fn(),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { revertToVersion } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/websites/[id]/revert", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/revert", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(revertToVersion).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/revert", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("reverts to version and returns result on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(revertToVersion).mockResolvedValue({ id: "v3", version: 3 } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/revert", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, id: "v3", version: 3 });
    expect(revertToVersion).toHaveBeenCalledWith("v1", "u1");
  });

  it("returns 404 when version not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(revertToVersion).mockRejectedValue(new Error("version_not_found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/revert", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("version_not_found");
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(revertToVersion).mockRejectedValue(new Error("db_error"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/revert", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("db_error");
  });
});
