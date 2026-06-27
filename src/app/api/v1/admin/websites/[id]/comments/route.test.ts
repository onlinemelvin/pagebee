import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/review", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
  createCommentSchema: {
    safeParse: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { requireReview } from "@/lib/auth/session";
import { listComments, addComment, createCommentSchema } from "@/lib/modules/review";

const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/websites/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(listComments).not.toHaveBeenCalled();
  });

  it("returns 403 without review permission", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(403));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments");
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns comments on success", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    const mockComments = [{ id: "cm1", body: "Looks good" }];
    vi.mocked(listComments).mockResolvedValue(mockComments as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ comments: mockComments });
    expect(listComments).toHaveBeenCalledWith("v1");
  });
});

describe("POST /api/v1/admin/websites/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireReview).mockRejectedValue(new AuthError(401));
    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "Fix this" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "a@b.com" } as never);
    vi.mocked(createCommentSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("adds comment and returns 201 on success (admin author)", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u1", isAdmin: true, email: "admin@b.com" } as never);
    vi.mocked(createCommentSchema.safeParse).mockReturnValue({
      success: true,
      data: { body: "Fix the header", type: "CHANGE_REQUEST" },
    } as never);
    const mockComment = { id: "cm1", body: "Fix the header" };
    vi.mocked(addComment).mockResolvedValue(mockComment as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "Fix the header" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ comment: mockComment });
    expect(addComment).toHaveBeenCalledWith(
      "v1",
      { type: "ADMIN", id: "u1", name: "admin@b.com" },
      { body: "Fix the header", type: "CHANGE_REQUEST" },
    );
  });

  it("sets author type REVIEWER when not admin", async () => {
    vi.mocked(requireReview).mockResolvedValue({ userId: "u2", isAdmin: false, email: "rev@b.com" } as never);
    vi.mocked(createCommentSchema.safeParse).mockReturnValue({
      success: true,
      data: { body: "LGTM" },
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "cm2" } as never);

    const req = new Request("http://localhost/api/v1/admin/websites/v1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "LGTM" }),
    });
    await POST(req, { params });
    expect(addComment).toHaveBeenCalledWith(
      "v1",
      { type: "REVIEWER", id: "u2", name: "rev@b.com" },
      expect.anything(),
    );
  });
});
