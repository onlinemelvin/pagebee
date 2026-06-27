import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
  CampaignError: class CampaignError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
  templateSchema: {
    safeParse: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { listTemplates, createTemplate, CampaignError, templateSchema } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/email/templates", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns templates on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    const mockTemplates = [{ id: "t1", name: "Welcome" }];
    vi.mocked(listTemplates).mockResolvedValue(mockTemplates as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ templates: mockTemplates });
  });
});

describe("POST /api/v1/admin/email/templates", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/templates", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(templateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/email/templates", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates template and returns 201 on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(templateSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: "Welcome", subject: "Welcome!", bodyHtml: "<p>Hi</p>", category: "ANNOUNCEMENT" },
    } as never);
    const mockTemplate = { id: "t1", name: "Welcome" };
    vi.mocked(createTemplate).mockResolvedValue(mockTemplate as never);

    const req = new Request("http://localhost/api/v1/admin/email/templates", {
      method: "POST",
      body: JSON.stringify({ name: "Welcome", subject: "Welcome!", bodyHtml: "<p>Hi</p>" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.template).toEqual(mockTemplate);
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: "u1" }),
    );
  });

  it("returns CampaignError status when create fails", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(templateSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: "Welcome", subject: "Welcome!", bodyHtml: "<p>Hi</p>", category: "ANNOUNCEMENT" },
    } as never);
    vi.mocked(createTemplate).mockRejectedValue(new CampaignError(409, "name_conflict"));

    const req = new Request("http://localhost/api/v1/admin/email/templates", {
      method: "POST",
      body: JSON.stringify({ name: "Welcome" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("name_conflict");
  });
});
