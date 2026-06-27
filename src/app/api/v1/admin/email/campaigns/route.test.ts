import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  segmentCount: vi.fn(),
  campaignSchema: {
    safeParse: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { listCampaigns, createCampaign, segmentCount, campaignSchema } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/email/campaigns", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listCampaigns).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns campaigns on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    const mockCampaigns = [{ id: "c1", name: "Test" }];
    vi.mocked(listCampaigns).mockResolvedValue(mockCampaigns as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ campaigns: mockCampaigns });
  });
});

describe("POST /api/v1/admin/email/campaigns", () => {
  const validBody = {
    name: "My Campaign",
    subject: "Hello",
    bodyHtml: "<p>Body</p>",
    segment: {},
  };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/campaigns", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(campaignSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("creates campaign and returns 201 on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(campaignSchema.safeParse).mockReturnValue({
      success: true,
      data: { ...validBody, scheduledAt: null },
    } as never);
    vi.mocked(segmentCount).mockResolvedValue(42 as never);
    const mockCampaign = { id: "c1", name: "My Campaign" };
    vi.mocked(createCampaign).mockResolvedValue(mockCampaign as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.campaign).toEqual(mockCampaign);
    expect(body.recipients).toBe(42);
    expect(createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: "u1", scheduledAt: null }),
    );
  });
});
