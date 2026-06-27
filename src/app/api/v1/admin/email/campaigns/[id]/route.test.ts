import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({
  sendCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  CampaignError: class CampaignError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
  campaignUpdateSchema: {
    safeParse: vi.fn(),
  },
}));

import { PATCH, POST } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { sendCampaign, cancelCampaign, updateCampaign, CampaignError, campaignUpdateSchema } from "@/lib/modules/email";

const params = Promise.resolve({ id: "c1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/admin/email/campaigns/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(campaignUpdateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it("updates campaign on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(campaignUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: "Updated" },
    } as never);
    const mockCampaign = { id: "c1", name: "Updated" };
    vi.mocked(updateCampaign).mockResolvedValue(mockCampaign as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ campaign: mockCampaign });
    expect(updateCampaign).toHaveBeenCalledWith("c1", { name: "Updated" });
  });

  it("returns CampaignError status when update fails with CampaignError", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(campaignUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: "Updated" },
    } as never);
    vi.mocked(updateCampaign).mockRejectedValue(new CampaignError(409, "campaign_not_draft"));

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("campaign_not_draft");
  });
});

describe("POST /api/v1/admin/email/campaigns/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("sends campaign when no action param", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(sendCampaign).mockResolvedValue({ sent: 10 } as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(sendCampaign).toHaveBeenCalledWith("c1");
  });

  it("cancels campaign when action=cancel", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    const mockCampaign = { id: "c1", status: "CANCELLED" };
    vi.mocked(cancelCampaign).mockResolvedValue(mockCampaign as never);

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1?action=cancel", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaign).toEqual(mockCampaign);
    expect(cancelCampaign).toHaveBeenCalledWith("c1");
  });

  it("returns CampaignError status on send failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(sendCampaign).mockRejectedValue(new CampaignError(409, "already_sent"));

    const req = new Request("http://localhost/api/v1/admin/email/campaigns/c1", {
      method: "POST",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_sent");
  });
});
