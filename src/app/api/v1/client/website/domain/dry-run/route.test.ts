import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  assertFeature: vi.fn(),
  isDomainDryRunEligible: vi.fn(),
}));
vi.mock("@/lib/modules/client", () => ({
  setClientFeature: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature, isDomainDryRunEligible } from "@/lib/auth/policy";
import { setClientFeature } from "@/lib/modules/client";

const makeClient = (id = "c1") => ({ id, businessName: "Acme", subscription: { plan: { featureFlags: { customDomain: true } } } });
const makeCtx = (email = "user@test.com") => ({ userId: "u1", email });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/domain/dry-run", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/dry-run", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ enabled: true }));
    expect(res.status).toBe(401);
    expect(setClientFeature).not.toHaveBeenCalled();
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ ctx: makeCtx(), client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403, "feature_not_in_plan"); });
    const res = await POST(req({ enabled: true }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is not dry-run eligible", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ ctx: makeCtx("real@customer.com"), client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(isDomainDryRunEligible).mockReturnValue(false);
    const res = await POST(req({ enabled: true }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "not_eligible" });
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ ctx: makeCtx(), client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(isDomainDryRunEligible).mockReturnValue(true);
    const res = await POST(req({ enabled: "yes" })); // not boolean
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("sets dry-run flag and returns ok on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ ctx: makeCtx(), client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(isDomainDryRunEligible).mockReturnValue(true);
    vi.mocked(setClientFeature).mockResolvedValue(undefined as never);
    const res = await POST(req({ enabled: true }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, enabled: true });
    expect(setClientFeature).toHaveBeenCalledWith("c1", "domainBuyDryRun", true);
  });
});
