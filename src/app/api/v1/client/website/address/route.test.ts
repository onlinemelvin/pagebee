import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  getWebsiteAddress: vi.fn(),
  checkSubdomain: vi.fn(),
  setSubdomain: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getWebsiteAddress, checkSubdomain, setSubdomain } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id, businessName: "Acme" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/website/address", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getWebsiteAddress).not.toHaveBeenCalled();
  });

  it("returns 403 for non-owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns website address on success", async () => {
    const client = makeClient();
    vi.mocked(requireOwner).mockResolvedValue({ client } as never);
    vi.mocked(getWebsiteAddress).mockResolvedValue({ subdomain: "acme", rootDomain: "pagebee.com" } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ subdomain: "acme", rootDomain: "pagebee.com" });
    expect(getWebsiteAddress).toHaveBeenCalledWith("c1");
  });
});

describe("POST /api/v1/client/website/address", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/v1/client/website/address", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ subdomain: "acme" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    const res = await POST(req({ subdomain: "" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("calls checkSubdomain when check: true", async () => {
    const client = makeClient();
    vi.mocked(requireOwner).mockResolvedValue({ client } as never);
    vi.mocked(checkSubdomain).mockResolvedValue({ available: true } as never);
    const res = await POST(req({ subdomain: "mysite", check: true }));
    expect(res.status).toBe(200);
    expect(checkSubdomain).toHaveBeenCalledWith("c1", "mysite");
    expect(setSubdomain).not.toHaveBeenCalled();
  });

  it("calls setSubdomain when check is not set", async () => {
    const client = makeClient();
    vi.mocked(requireOwner).mockResolvedValue({ client } as never);
    vi.mocked(setSubdomain).mockResolvedValue({} as never);
    const res = await POST(req({ subdomain: "mysite" }));
    expect(res.status).toBe(200);
    expect(setSubdomain).toHaveBeenCalledWith("c1", "mysite");
  });

  it("returns 409 when setSubdomain throws no_website", async () => {
    const client = makeClient();
    vi.mocked(requireOwner).mockResolvedValue({ client } as never);
    vi.mocked(setSubdomain).mockRejectedValue(new Error("no_website"));
    const res = await POST(req({ subdomain: "mysite" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 when setSubdomain throws another error", async () => {
    const client = makeClient();
    vi.mocked(requireOwner).mockResolvedValue({ client } as never);
    vi.mocked(setSubdomain).mockRejectedValue(new Error("already_taken"));
    const res = await POST(req({ subdomain: "mysite" }));
    expect(res.status).toBe(400);
  });
});
