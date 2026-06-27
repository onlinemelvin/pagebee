import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  regenerateFromScratch: vi.fn(),
  getWebsiteGenStatus: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { regenerateFromScratch, getWebsiteGenStatus } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/websites/[id]/regenerate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(getWebsiteGenStatus).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate");
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when status not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({} as never);
    vi.mocked(getWebsiteGenStatus).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns generation status on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({} as never);
    const mockStatus = { running: false, version: { id: "v1", status: "DRAFT" } };
    vi.mocked(getWebsiteGenStatus).mockResolvedValue(mockStatus as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(mockStatus);
    expect(getWebsiteGenStatus).toHaveBeenCalledWith("v1");
  });
});

describe("POST /api/v1/admin/websites/[id]/regenerate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(regenerateFromScratch).not.toHaveBeenCalled();
  });

  it("regenerates and returns result on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    const mockResult = { jobId: "j1", versionId: "v2" };
    vi.mocked(regenerateFromScratch).mockResolvedValue(mockResult as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(mockResult);
    expect(regenerateFromScratch).toHaveBeenCalledWith("v1", "u1");
  });

  it("returns 404 on error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(regenerateFromScratch).mockRejectedValue(new Error("not found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/regenerate", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
