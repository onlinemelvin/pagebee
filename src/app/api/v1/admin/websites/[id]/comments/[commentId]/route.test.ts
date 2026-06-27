import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/review", () => ({
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  getCommentScope: vi.fn(),
  updateCommentSchema: {
    safeParse: vi.fn(),
  },
}));

import { PATCH, DELETE } from "./route";
import { requireReview } from "@/lib/auth/session";
import { updateComment, deleteComment, getCommentScope, updateCommentSchema } from "@/lib/modules/review";

const params = Promise.resolve({ id: "v1", commentId: "cm1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/admin/websites/[id]/comments/[commentId]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when comment not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when comment belongs to different version", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue({ versionId: "OTHER_VERSION" } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue({ versionId: "v1" } as never);
    vi.mocked(updateCommentSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it("updates comment on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue({ versionId: "v1" } as never);
    vi.mocked(updateCommentSchema.safeParse).mockReturnValue({
      success: true,
      data: { resolved: true },
    } as never);
    const mockComment = { id: "cm1", resolved: true };
    vi.mocked(updateComment).mockResolvedValue(mockComment as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify({ resolved: true }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ comment: mockComment });
    expect(updateComment).toHaveBeenCalledWith(
      "cm1",
      { type: "ADMIN", id: "u1", name: "a@b.com" },
      { resolved: true },
    );
  });
});

describe("DELETE /api/v1/admin/websites/[id]/comments/[commentId]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
    expect(deleteComment).not.toHaveBeenCalled();
  });

  it("returns 404 when comment not found", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(404);
    expect(deleteComment).not.toHaveBeenCalled();
  });

  it("deletes comment and returns ok on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(getCommentScope).mockResolvedValue({ versionId: "v1" } as never);
    vi.mocked(deleteComment).mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments/cm1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteComment).toHaveBeenCalledWith("cm1");
  });
});
