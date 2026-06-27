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
  getDomainState: vi.fn(),
  getConnectInstructions: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getDomainState, getConnectInstructions } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/domain/instructions", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/website/domain/instructions", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ registrar: "Namecheap" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403); });
    const res = await POST(req({ registrar: "Namecheap" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing registrar", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 409 when client has no domain", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(getDomainState).mockResolvedValue(null as never);
    const res = await POST(req({ registrar: "Namecheap" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "no_domain" });
  });

  it("returns instructions on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(getDomainState).mockResolvedValue({
      domain: "acme.com",
      hosts: [{ verification: { records: [{ type: "CNAME", name: "www", value: "cname.vercel-dns.com" }] } }],
    } as never);
    vi.mocked(getConnectInstructions).mockResolvedValue("Step 1: ..." as never);
    const res = await POST(req({ registrar: "Namecheap" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ instructions: "Step 1: ..." });
    expect(getConnectInstructions).toHaveBeenCalledWith("Namecheap", "acme.com", expect.any(Array));
  });
});
