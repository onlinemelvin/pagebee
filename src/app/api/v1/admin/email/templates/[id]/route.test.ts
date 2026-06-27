import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  templateUpdateSchema: {
    safeParse: vi.fn(),
  },
}));

import { PATCH, DELETE } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { updateTemplate, deleteTemplate, templateUpdateSchema } from "@/lib/modules/email";

const params = Promise.resolve({ id: "t1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/admin/email/templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(templateUpdateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "PATCH",
      body: JSON.stringify({ name: "" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it("updates template on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(templateUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: "Updated" },
    } as never);
    const mockTemplate = { id: "t1", name: "Updated" };
    vi.mocked(updateTemplate).mockResolvedValue(mockTemplate as never);

    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ template: mockTemplate });
    expect(updateTemplate).toHaveBeenCalledWith("t1", { name: "Updated" });
  });
});

describe("DELETE /api/v1/admin/email/templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
    expect(deleteTemplate).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(403);
  });

  it("deletes template and returns ok on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(deleteTemplate).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/email/templates/t1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteTemplate).toHaveBeenCalledWith("t1");
  });
});
