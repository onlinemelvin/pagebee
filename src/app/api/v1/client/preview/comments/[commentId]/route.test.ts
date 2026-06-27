import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
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
import { requireClient } from "@/lib/auth/session";
import { updateComment, deleteComment, getCommentScope, updateCommentSchema } from "@/lib/modules/review";

const makeClient = (id = "c1") => ({ id, businessName: "Acme" });

const params = (commentId = "cm1") => ({ params: Promise.resolve({ commentId }) });

/** A scope that belongs to client c1 */
const makeScope = (clientId = "c1") => ({
  authorType: "CLIENT",
  version: { website: { clientId } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/preview/comments/[commentId]", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/v1/client/preview/comments/cm1", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await PATCH(req({}), params());
    expect(res.status).toBe(401);
    expect(getCommentScope).not.toHaveBeenCalled();
  });

  it("returns 404 when comment does not exist", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getCommentScope).mockResolvedValue(null as never);
    const res = await PATCH(req({ body: "edit" }), params());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("returns 404 when comment belongs to another tenant", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient("c1") } as never);
    vi.mocked(getCommentScope).mockResolvedValue(makeScope("c2") as never);
    const res = await PATCH(req({ body: "edit" }), params());
    expect(res.status).toBe(404);
  });

  it("returns 404 when comment is not CLIENT-authored", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getCommentScope).mockResolvedValue({
      authorType: "INTERNAL",
      version: { website: { clientId: "c1" } },
    } as never);
    const res = await PATCH(req({ body: "edit" }), params());
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid update body", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getCommentScope).mockResolvedValue(makeScope() as never);
    vi.mocked(updateCommentSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({}) },
    } as never);
    const res = await PATCH(req({}), params());
    expect(res.status).toBe(400);
  });

  it("updates comment and returns it on success", async () => {
    const client = makeClient();
    vi.mocked(requireClient).mockResolvedValue({ client } as never);
    vi.mocked(getCommentScope).mockResolvedValue(makeScope() as never);
    const data = { body: "Updated text", resolved: false };
    vi.mocked(updateCommentSchema.safeParse).mockReturnValue({ success: true, data } as never);
    const updatedComment = { id: "cm1", body: "Updated text" };
    vi.mocked(updateComment).mockResolvedValue(updatedComment as never);
    const res = await PATCH(req(data), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ comment: updatedComment });
    expect(updateComment).toHaveBeenCalledWith(
      "cm1",
      { type: "CLIENT", id: "c1", name: "Acme" },
      data,
    );
  });
});

describe("DELETE /api/v1/client/preview/comments/[commentId]", () => {
  const req = () =>
    new Request("http://localhost/api/v1/client/preview/comments/cm1", {
      method: "DELETE",
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await DELETE(req(), params());
    expect(res.status).toBe(401);
    expect(deleteComment).not.toHaveBeenCalled();
  });

  it("returns 404 when comment not found or wrong tenant", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient("c1") } as never);
    vi.mocked(getCommentScope).mockResolvedValue(makeScope("c2") as never);
    const res = await DELETE(req(), params());
    expect(res.status).toBe(404);
    expect(deleteComment).not.toHaveBeenCalled();
  });

  it("deletes comment and returns ok on success", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getCommentScope).mockResolvedValue(makeScope() as never);
    vi.mocked(deleteComment).mockResolvedValue(undefined as never);
    const res = await DELETE(req(), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteComment).toHaveBeenCalledWith("cm1");
  });
});
