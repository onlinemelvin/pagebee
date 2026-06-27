import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  saveManualEdit: vi.fn(),
}));

import { POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { saveManualEdit } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/admin/websites/[id]/edit-html", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<html><body>Hi</body></html>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(saveManualEdit).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<html><body>Hi</body></html>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is missing html", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ other: "stuff" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_html");
  });

  it("returns 400 when html does not contain <html tag", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<div>just a div</div>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_html");
  });

  it("saves edit and returns new version on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(saveManualEdit).mockResolvedValue({ id: "v2", version: 2 } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<html><body>Updated</body></html>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, id: "v2", version: 2 });
    expect(saveManualEdit).toHaveBeenCalledWith("v1", "<html><body>Updated</body></html>", "u1");
  });

  it("returns 404 when version not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(saveManualEdit).mockRejectedValue(new Error("version_not_found"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<html><body>Updated</body></html>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("version_not_found");
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(saveManualEdit).mockRejectedValue(new Error("db_error"));

    const req = new Request("http://localhost/api/v1/admin/websites/v1/edit-html", {
      method: "POST",
      body: JSON.stringify({ html: "<html><body>Updated</body></html>" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
  });
});
