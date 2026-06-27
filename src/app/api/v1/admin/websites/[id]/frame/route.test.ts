import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  getVersionFrameData: vi.fn(),
}));
vi.mock("@/lib/site/serve", () => ({
  serveReviewFrame: vi.fn(),
}));

import { GET } from "./route";
import { requireReview } from "@/lib/auth/session";
import { getVersionFrameData } from "@/lib/modules/website";
import { serveReviewFrame } from "@/lib/site/serve";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/websites/[id]/frame", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/frame");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(getVersionFrameData).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/frame");
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when version data not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(getVersionFrameData).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/frame");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns review frame on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(getVersionFrameData).mockResolvedValue({ html: "<html></html>", siteToken: "tok1" } as never);
    const mockResponse = new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } });
    vi.mocked(serveReviewFrame).mockReturnValue(mockResponse as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/frame");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(serveReviewFrame).toHaveBeenCalledWith("<html></html>", "tok1", req);
  });
});
