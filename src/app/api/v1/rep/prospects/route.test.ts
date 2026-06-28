import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { SalesError } from "@/lib/modules/sales";

vi.mock("@/lib/auth/session", () => ({
  requireRep: vi.fn(),
  requireContractedRep: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/sales", async () => {
  const actual = await vi.importActual<typeof import("@/lib/modules/sales")>("@/lib/modules/sales");
  return { ...actual, listProspects: vi.fn(), createProspect: vi.fn() };
});

import { GET, POST } from "./route";
import { requireRep, requireContractedRep } from "@/lib/auth/session";
import { listProspects, createProspect } from "@/lib/modules/sales";

const rep = { ctx: { userId: "u1" }, employee: { id: "rep1" } };

function req(url: string, body?: unknown): Request {
  return new Request(url, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/rep/prospects", () => {
  it("401 when not a signed-in rep", async () => {
    vi.mocked(requireRep).mockRejectedValue(new AuthError(401));
    const res = await GET(req("http://x/api/v1/rep/prospects"));
    expect(res.status).toBe(401);
  });

  it("403 when signed in but not a rep", async () => {
    vi.mocked(requireRep).mockRejectedValue(new AuthError(403));
    const res = await GET(req("http://x/api/v1/rep/prospects"));
    expect(res.status).toBe(403);
  });

  it("lists the rep's prospects, scoped by employee id", async () => {
    vi.mocked(requireRep).mockResolvedValue(rep as never);
    vi.mocked(listProspects).mockResolvedValue([{ id: "p1" }] as never);
    const res = await GET(req("http://x/api/v1/rep/prospects?q=acme&status=new"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ prospects: [{ id: "p1" }] });
    expect(listProspects).toHaveBeenCalledWith("rep1", { search: "acme", status: "new" });
  });
});

describe("POST /api/v1/rep/prospects", () => {
  it("403 (contract_required) when the rep has no active contract", async () => {
    vi.mocked(requireContractedRep).mockRejectedValue(new AuthError(403, "contract_required"));
    const res = await POST(req("http://x/api/v1/rep/prospects", { businessName: "Acme" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "contract_required" });
  });

  it("creates and returns 201", async () => {
    vi.mocked(requireContractedRep).mockResolvedValue(rep as never);
    vi.mocked(createProspect).mockResolvedValue({ id: "p1", businessName: "Acme" } as never);
    const res = await POST(req("http://x/api/v1/rep/prospects", { businessName: "Acme" }));
    expect(res.status).toBe(201);
    expect(createProspect).toHaveBeenCalledWith("rep1", { businessName: "Acme" }, { userId: "u1" });
  });

  it("maps a claimed-prospect SalesError to its status (409)", async () => {
    vi.mocked(requireContractedRep).mockResolvedValue(rep as never);
    vi.mocked(createProspect).mockRejectedValue(new SalesError("prospect_claimed", 409));
    const res = await POST(req("http://x/api/v1/rep/prospects", { businessName: "Acme" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "prospect_claimed" });
  });
});
