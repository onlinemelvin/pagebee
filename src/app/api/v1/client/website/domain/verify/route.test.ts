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
  verifyClientDomains: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { verifyClientDomains } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/verify", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(verifyClientDomains).not.toHaveBeenCalled();
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403); });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns refreshed domain state on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const state = { domain: "acme.com", status: "ACTIVE" };
    vi.mocked(verifyClientDomains).mockResolvedValue(state as never);
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ domain: state });
    expect(verifyClientDomains).toHaveBeenCalledWith("c1");
  });
});
