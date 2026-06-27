import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/knowledge", () => ({
  getKnowledge: vi.fn(),
  setKnowledge: vi.fn(),
  knowledgeUpdateSchema: {
    safeParse: vi.fn(),
  },
}));

import { GET, PUT } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getKnowledge, setKnowledge, knowledgeUpdateSchema } from "@/lib/modules/knowledge";

beforeEach(() => {
  vi.clearAllMocks();
});

const req = (body?: unknown) =>
  new Request("http://localhost/api/v1/client/knowledge", {
    method: body !== undefined ? "PUT" : "GET",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/v1/client/knowledge", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));

    const res = await GET();
    expect(res.status).toBe(401);
    expect(getKnowledge).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks the website:view capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the knowledge data scoped to the authenticated client", async () => {
    const fakeClient = { id: "c1" };
    vi.mocked(requireCapability).mockResolvedValue({ client: fakeClient } as never);
    vi.mocked(getKnowledge).mockResolvedValue({
      data: { about: "We fix pipes", details: "", policies: "", faqs: [] },
      documents: [],
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(requireCapability).toHaveBeenCalledWith("website", "view");
    expect(getKnowledge).toHaveBeenCalledWith("c1");
    const body = await res.json();
    expect(body.data.about).toBe("We fix pipes");
  });
});

// ─── PUT ──────────────────────────────────────────────────────────────────────

describe("PUT /api/v1/client/knowledge", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));

    const res = await PUT(req({ about: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));

    const res = await PUT(req({ about: "hello" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when the request body fails validation", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);
    vi.mocked(knowledgeUpdateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const res = await PUT(req({ about: "x".repeat(99_999) }));
    expect(res.status).toBe(400);
    expect(setKnowledge).not.toHaveBeenCalled();
  });

  it("calls setKnowledge with the authenticated clientId and returns updated data", async () => {
    const fakeClient = { id: "c1" };
    vi.mocked(requireCapability).mockResolvedValue({ client: fakeClient } as never);
    vi.mocked(knowledgeUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { about: "Updated about" },
    } as never);
    vi.mocked(setKnowledge).mockResolvedValue({
      about: "Updated about",
      details: "",
      policies: "",
      faqs: [],
    });

    const res = await PUT(req({ about: "Updated about" }));

    expect(res.status).toBe(200);
    expect(requireCapability).toHaveBeenCalledWith("website", "manage");
    expect(setKnowledge).toHaveBeenCalledWith("c1", { about: "Updated about" });
    const body = await res.json();
    expect(body.data.about).toBe("Updated about");
  });
});
