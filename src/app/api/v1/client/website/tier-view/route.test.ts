import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  getSiteBlocks: vi.fn(),
  setTierView: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getSiteBlocks, setTierView } from "@/lib/modules/website";

const makeClient = (id = "c1") => ({ id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/website/tier-view", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getSiteBlocks).not.toHaveBeenCalled();
  });

  it("returns 403 for non-owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns site blocks on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    const blocks = { viewPlan: "NECTAR", blocks: [{ id: "b1" }] };
    vi.mocked(getSiteBlocks).mockResolvedValue(blocks as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(blocks);
    expect(getSiteBlocks).toHaveBeenCalledWith("c1");
  });
});

describe("POST /api/v1/client/website/tier-view", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/v1/client/website/tier-view", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ plan: "HONEY" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 400 when setTierView throws invalid_plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(setTierView).mockRejectedValue(new Error("invalid_plan"));
    const res = await POST(req({ plan: "INVALID" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_plan" });
  });

  it("returns tier view data on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    const result = { viewPlan: "HONEY", blocks: [{ id: "b1" }] };
    vi.mocked(setTierView).mockResolvedValue(result as never);
    const res = await POST(req({ plan: "HONEY", keptSections: ["hero"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(result);
    expect(setTierView).toHaveBeenCalledWith("c1", "HONEY", ["hero"]);
  });
});
