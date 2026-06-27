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
  return { approve: vi.fn(), PreviewError };
});
const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: posthogCapture }),
}));

import { POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { approve, PreviewError } from "@/lib/modules/preview";

const makeClient = (id = "c1") => ({ id, businessName: "Acme" });
const makeCtx = (userId = "u1") => ({ userId });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/preview/approve", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(approve).not.toHaveBeenCalled();
  });

  it("returns 402 for inactive account", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(402, "subscription_inactive"));
    const res = await POST();
    expect(res.status).toBe(402);
  });

  it("handles PreviewError and returns its status + code", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient(), ctx: makeCtx() } as never);
    vi.mocked(approve).mockRejectedValue(new PreviewError(409, "no_preview"));
    const res = await POST();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "no_preview" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient(), ctx: makeCtx() } as never);
    vi.mocked(approve).mockRejectedValue(new Error("database error"));
    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "internal_error" });
  });

  it("approves and captures posthog event on success", async () => {
    const client = makeClient();
    const ctx = makeCtx();
    vi.mocked(requireClient).mockResolvedValue({ client, ctx } as never);
    const result = { ok: true, launched: true };
    vi.mocked(approve).mockResolvedValue(result as never);
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(result);
    expect(approve).toHaveBeenCalledWith("c1");
    expect(posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "preview_approved", distinctId: "u1" }),
    );
  });
});
