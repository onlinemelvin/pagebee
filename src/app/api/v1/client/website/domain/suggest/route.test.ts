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
  suggestDomainNames: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { suggestDomainNames } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/domain/suggest", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/suggest", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(suggestDomainNames).not.toHaveBeenCalled();
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403); });
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (too many TLDs)", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    // tlds array exceeds max of 6
    const res = await POST(req({ tlds: [".com", ".net", ".org", ".io", ".co", ".app", ".dev"] }));
    expect(res.status).toBe(400);
  });

  it("calls suggestDomainNames with empty options when body is empty", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(suggestDomainNames).mockResolvedValue([] as never);
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ suggestions: [] });
    expect(suggestDomainNames).toHaveBeenCalledWith("c1", {});
  });

  it("returns suggestions on success with options", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const suggestions = [{ domain: "acme.com", available: true, price: 1200 }];
    vi.mocked(suggestDomainNames).mockResolvedValue(suggestions as never);
    const res = await POST(req({ keyword: "plumber", tlds: [".com"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ suggestions });
    expect(suggestDomainNames).toHaveBeenCalledWith("c1", { keyword: "plumber", tlds: [".com"] });
  });
});
