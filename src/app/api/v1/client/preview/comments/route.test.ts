import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/preview", () => ({
  getClientReviewContext: vi.fn(),
}));
vi.mock("@/lib/modules/review", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
  createCommentSchema: {
    safeParse: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { getClientReviewContext } from "@/lib/modules/preview";
import { listComments, addComment, createCommentSchema } from "@/lib/modules/review";

const makeClient = (id = "c1") => ({ id, businessName: "Acme" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/preview/comments", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listComments).not.toHaveBeenCalled();
  });

  it("returns empty array when no version", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ versionId: null, canComment: false } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ comments: [] });
    expect(listComments).not.toHaveBeenCalled();
  });

  it("returns only CLIENT-authored comments", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ versionId: "v1", canComment: true } as never);
    vi.mocked(listComments).mockResolvedValue([
      { id: "cm1", authorType: "CLIENT", body: "looks good" },
      { id: "cm2", authorType: "INTERNAL", body: "note for reviewer" },
    ] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe("cm1");
    expect(listComments).toHaveBeenCalledWith("v1");
  });
});

describe("POST /api/v1/client/preview/comments", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/v1/client/preview/comments", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ body: "Please fix" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when client cannot comment", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ canComment: false, versionId: "v1" } as never);
    const res = await POST(req({ body: "fix this" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "not_reviewable" });
  });

  it("returns 403 when no version", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ canComment: true, versionId: null } as never);
    const res = await POST(req({ body: "fix this" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid comment body", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ canComment: true, versionId: "v1" } as never);
    vi.mocked(createCommentSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({}) },
    } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("adds comment and returns 201 on success", async () => {
    const client = makeClient();
    vi.mocked(requireClient).mockResolvedValue({ client } as never);
    vi.mocked(getClientReviewContext).mockResolvedValue({ canComment: true, versionId: "v1" } as never);
    const data = { body: "Please fix the header colour", anchor: null };
    vi.mocked(createCommentSchema.safeParse).mockReturnValue({ success: true, data } as never);
    const comment = { id: "cm1", authorType: "CLIENT", body: data.body };
    vi.mocked(addComment).mockResolvedValue(comment as never);
    const res = await POST(req(data));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ comment });
    expect(addComment).toHaveBeenCalledWith(
      "v1",
      { type: "CLIENT", id: "c1", name: "Acme" },
      data,
    );
  });
});
