import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  retryGenerationJob: vi.fn(),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { retryGenerationJob } from "@/lib/modules/website";

const params = Promise.resolve({ jobId: "job1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/website-jobs/[jobId]/retry", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/website-jobs/job1/retry", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(retryGenerationJob).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/website-jobs/job1/retry", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("retries job and returns ok on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(retryGenerationJob).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/website-jobs/job1/retry", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(retryGenerationJob).toHaveBeenCalledWith("job1", "u1");
  });

  it("returns 404 when job not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(retryGenerationJob).mockRejectedValue(new Error("job_not_found"));

    const req = new Request("http://localhost/api/v1/admin/website-jobs/job1/retry", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("job_not_found");
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(retryGenerationJob).mockRejectedValue(new Error("database failure"));

    const req = new Request("http://localhost/api/v1/admin/website-jobs/job1/retry", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
  });
});
