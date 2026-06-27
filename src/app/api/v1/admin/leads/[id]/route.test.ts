import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/lead", () => ({
  updateLead: vi.fn(),
  leadUpdateSchema: {
    safeParse: vi.fn(),
  },
}));

import { PATCH } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { updateLead, leadUpdateSchema } from "@/lib/modules/lead";

const params = Promise.resolve({ id: "l1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/admin/leads/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/leads/l1", {
      method: "PATCH",
      body: JSON.stringify({ status: "CONTACTED" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/leads/l1", {
      method: "PATCH",
      body: JSON.stringify({ status: "CONTACTED" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/leads/l1", {
      method: "PATCH",
      body: JSON.stringify({ status: "INVALID_STATUS" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("updates lead on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { status: "CONTACTED" },
    } as never);
    const mockLead = { id: "l1", status: "CONTACTED" };
    vi.mocked(updateLead).mockResolvedValue(mockLead as never);

    const req = new Request("http://localhost/api/v1/admin/leads/l1", {
      method: "PATCH",
      body: JSON.stringify({ status: "CONTACTED" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ lead: mockLead });
    expect(updateLead).toHaveBeenCalledWith("l1", { status: "CONTACTED" }, { userId: "u1" });
  });

  it("returns 404 when update throws (not found)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { status: "CONTACTED" },
    } as never);
    vi.mocked(updateLead).mockRejectedValue(new Error("lead not found"));

    const req = new Request("http://localhost/api/v1/admin/leads/l1", {
      method: "PATCH",
      body: JSON.stringify({ status: "CONTACTED" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
