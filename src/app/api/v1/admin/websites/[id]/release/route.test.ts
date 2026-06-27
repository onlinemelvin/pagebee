import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  releaseToClient: vi.fn(),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { releaseToClient } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/websites/[id]/release", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/release", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(releaseToClient).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/release", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("releases to client and returns ok on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(releaseToClient).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/release", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(releaseToClient).toHaveBeenCalledWith("v1", "u1");
  });

  it("returns 404 on error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(releaseToClient).mockRejectedValue(new Error("version not found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/release", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
