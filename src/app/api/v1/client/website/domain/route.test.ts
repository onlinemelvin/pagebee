import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import type { NextResponse } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  assertFeature: vi.fn(),
}));
vi.mock("@/lib/modules/website", () => ({
  getDomainState: vi.fn(),
  requestCustomDomain: vi.fn(),
  removeCustomDomain: vi.fn(),
}));

import { GET, POST, DELETE } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getDomainState, requestCustomDomain, removeCustomDomain } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

// Helper to assert we always got a Response back (the domain route's gate() always does).
async function call(p: Promise<NextResponse | undefined>): Promise<NextResponse> {
  const r = await p;
  if (!r) throw new Error("Route returned undefined");
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/website/domain", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await call(GET());
    expect(res.status).toBe(401);
    expect(getDomainState).not.toHaveBeenCalled();
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403); });
    const res = await call(GET());
    expect(res.status).toBe(403);
  });

  it("returns null domain state when none set", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(getDomainState).mockResolvedValue(null as never);
    const res = await call(GET());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ domain: null });
  });

  it("returns domain state on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const domainState = { domain: "acme.com", status: "ACTIVE" };
    vi.mocked(getDomainState).mockResolvedValue(domainState as never);
    const res = await call(GET());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ domain: domainState });
    expect(getDomainState).toHaveBeenCalledWith("c1");
  });
});

describe("POST /api/v1/client/website/domain", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/v1/client/website/domain", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await call(POST(req({ domain: "acme.com" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const res = await call(POST(req({})));
    expect(res.status).toBe(400);
  });

  it("returns 409 for known error reason", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(requestCustomDomain).mockResolvedValue({ ok: false, reason: "taken" } as never);
    const res = await call(POST(req({ domain: "acme.com" })));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "taken" });
  });

  it("returns ok and domain state on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const state = { domain: "acme.com", status: "PENDING" };
    vi.mocked(requestCustomDomain).mockResolvedValue({ ok: true, state } as never);
    const res = await call(POST(req({ domain: "acme.com" })));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, domain: state });
    expect(requestCustomDomain).toHaveBeenCalledWith("c1", "acme.com");
  });
});

describe("DELETE /api/v1/client/website/domain", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await call(DELETE());
    expect(res.status).toBe(401);
    expect(removeCustomDomain).not.toHaveBeenCalled();
  });

  it("returns ok on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(removeCustomDomain).mockResolvedValue(undefined as never);
    const res = await call(DELETE());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(removeCustomDomain).toHaveBeenCalledWith("c1");
  });
});
