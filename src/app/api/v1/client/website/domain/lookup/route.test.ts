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
  lookupDomain: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { lookupDomain } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/domain/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/lookup", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(401);
    expect(lookupDomain).not.toHaveBeenCalled();
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

  it("returns error response for known reason", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(lookupDomain).mockResolvedValue({ ok: false, reason: "invalid" } as never);
    const res = await POST(req({ domain: "not-a-domain" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid" });
  });

  it("returns 503 for registrar_unavailable", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(lookupDomain).mockResolvedValue({ ok: false, reason: "registrar_unavailable" } as never);
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(503);
  });

  it("returns domain result on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const result = { available: true, price: 1200 };
    vi.mocked(lookupDomain).mockResolvedValue({ ok: true, result } as never);
    const res = await POST(req({ domain: "acme.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ result });
    expect(lookupDomain).toHaveBeenCalledWith("acme.com");
  });
});
