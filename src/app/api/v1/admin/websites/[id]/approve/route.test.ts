import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  publishUpdate: vi.fn(),
}));
const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: posthogCapture }),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { publishUpdate } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/websites/[id]/approve", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(publishUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("publishes update and returns ok on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(publishUpdate).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(publishUpdate).toHaveBeenCalledWith("v1", "u1");
  });

  it("captures posthog event on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(publishUpdate).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    await POST(req, { params });
    expect(posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "website_update_published" }),
    );
  });

  it("returns 404 when version not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(publishUpdate).mockRejectedValue(new Error("version_not_found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when not a live update", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(publishUpdate).mockRejectedValue(new Error("not_a_live_update"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(publishUpdate).mockRejectedValue(new Error("unexpected"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/approve", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
  });
});
