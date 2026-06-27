import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  requestWebsiteUpdate: vi.fn(),
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { requestWebsiteUpdate } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/update", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/update", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(requestWebsiteUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when capability denied", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });

  it("calls requestWebsiteUpdate with undefined note when body is empty", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestWebsiteUpdate).mockResolvedValue({ ok: true } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(requestWebsiteUpdate).toHaveBeenCalledWith("c1", undefined);
  });

  it("passes note string to requestWebsiteUpdate", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestWebsiteUpdate).mockResolvedValue({ ok: true } as never);
    await POST(req({ note: "Update my hero section" }));
    expect(requestWebsiteUpdate).toHaveBeenCalledWith("c1", "Update my hero section");
  });

  it("returns 409 when out of updates", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestWebsiteUpdate).mockResolvedValue({ ok: false, reason: "out_of_updates", quota: { used: 5, limit: 5 } } as never);
    const res = await POST(req({ note: "please update" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: "out_of_updates" });
  });

  it("returns 400 for other not-ok reasons", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestWebsiteUpdate).mockResolvedValue({ ok: false, reason: "no_live_site" } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(requestWebsiteUpdate).mockRejectedValue(new Error("database error"));
    const res = await POST(req({}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "internal_error" });
  });
});
