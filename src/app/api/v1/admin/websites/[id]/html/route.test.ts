import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  getVersionRawHtml: vi.fn(),
}));

import { GET } from "./route";
import { requireReview } from "@/lib/auth/session";
import { getVersionRawHtml } from "@/lib/modules/website";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/websites/[id]/html", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/html");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(getVersionRawHtml).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/html");
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when html is null", async () => {
    vi.mocked(requireReview).mockResolvedValue({} as never);
    vi.mocked(getVersionRawHtml).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/html");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns html on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({} as never);
    vi.mocked(getVersionRawHtml).mockResolvedValue("<html><body>Page</body></html>" as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/html");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ html: "<html><body>Page</body></html>" });
    expect(getVersionRawHtml).toHaveBeenCalledWith("v1");
  });
});
