import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { ZodError } from "zod";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/support", () => ({
  addComment: vi.fn(),
  SupportError: class SupportError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { addComment, SupportError } from "@/lib/modules/support";

const params = (id = "t-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("POST /api/v1/client/support/tickets/[id]/comments", () => {
  const postReq = (body: unknown, id = "t-1") =>
    new Request(`http://localhost/api/v1/client/support/tickets/${id}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ message: "Need help" }), params());
    expect(res.status).toBe(401);
    expect(addComment).not.toHaveBeenCalled();
  });

  it("returns 400 when addComment throws a ZodError", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(addComment).mockRejectedValue(
      new ZodError([{ code: "too_small", minimum: 1, origin: "string", inclusive: true, message: "Required", path: ["message"] }] as never)
    );

    const res = await POST(postReq({}), params("t-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns SupportError status when ticket not found", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(addComment).mockRejectedValue(new SupportError(404, "not_found"));

    const res = await POST(postReq({ message: "Help" }), params("t-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("adds a comment and returns 201 on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const comment = { id: "c-1", message: "Here is more info", authorId: "user-1" };
    vi.mocked(addComment).mockResolvedValue(comment as never);

    const res = await POST(postReq({ message: "Here is more info" }), params("t-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ comment });
    expect(addComment).toHaveBeenCalledWith("client-1", "t-1", "user-1", { message: "Here is more info" });
  });
});
