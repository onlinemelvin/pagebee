import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/preview", () => {
  class PreviewError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  }
  return { requestRevision: vi.fn(), PreviewError };
});

import { POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { requestRevision, PreviewError } from "@/lib/modules/preview";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/preview/request-revision", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/preview/request-revision", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(requestRevision).not.toHaveBeenCalled();
  });

  it("returns 402 for inactive account", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(402, "subscription_inactive"));
    const res = await POST(req({}));
    expect(res.status).toBe(402);
  });

  it("returns 400 for invalid body (note too long)", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const res = await POST(req({ note: "x".repeat(2001) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("handles PreviewError and returns its status + code", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestRevision).mockRejectedValue(new PreviewError(409, "no_revisions_left"));
    const res = await POST(req({ note: "Please fix" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "no_revisions_left" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestRevision).mockRejectedValue(new Error("database error"));
    const res = await POST(req({}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "internal_error" });
  });

  it("calls requestRevision with clientId and note on success", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const result = { ok: true, revisionsLeft: 0 };
    vi.mocked(requestRevision).mockResolvedValue(result as never);
    const res = await POST(req({ note: "Please redo the footer" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(result);
    expect(requestRevision).toHaveBeenCalledWith("c1", "Please redo the footer");
  });

  it("calls requestRevision with undefined when no note provided", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestRevision).mockResolvedValue({ ok: true } as never);
    await POST(req({}));
    expect(requestRevision).toHaveBeenCalledWith("c1", undefined);
  });
});
