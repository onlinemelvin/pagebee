import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  assertFeature: vi.fn(),
}));
vi.mock("@/lib/modules/website", () => ({
  requestPurchaseDomain: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { requestPurchaseDomain } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/domain/purchase", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/purchase", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(401);
    expect(requestPurchaseDomain).not.toHaveBeenCalled();
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403); });
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing domain", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns mapped error for known failure reason", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(requestPurchaseDomain).mockResolvedValue({ ok: false, reason: "in_progress" } as never);
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "in_progress" });
  });

  it("returns 503 for registrar_unavailable", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(requestPurchaseDomain).mockResolvedValue({ ok: false, reason: "registrar_unavailable" } as never);
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(503);
  });

  it("returns ok and domain state on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const state = { domain: "acme.com", status: "PENDING_REVIEW" };
    vi.mocked(requestPurchaseDomain).mockResolvedValue({ ok: true, state } as never);
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, domain: state });
    expect(requestPurchaseDomain).toHaveBeenCalledWith("c1", "acme.com");
  });
});
