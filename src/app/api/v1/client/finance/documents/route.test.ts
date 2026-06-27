import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({ capture: vi.fn() })),
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listDocuments, createDocument, FinanceError } from "@/lib/modules/finance";
import { getPostHogClient } from "@/lib/posthog-server";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  // re-apply factory default wiped by vi.resetAllMocks() in global setup
  vi.mocked(getPostHogClient).mockReturnValue({ capture: vi.fn() } as never);
});

describe("GET /api/v1/client/finance/documents", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents"));
    expect(res.status).toBe(401);
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents"));
    expect(res.status).toBe(403);
  });

  it("passes docType query param to service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(listDocuments).mockResolvedValue([] as never);
    await GET(new Request("http://localhost/api/v1/client/finance/documents?docType=INVOICE"));
    expect(listDocuments).toHaveBeenCalledWith("client-1", { docType: "INVOICE" });
  });

  it("passes undefined docType when param absent", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(listDocuments).mockResolvedValue([] as never);
    await GET(new Request("http://localhost/api/v1/client/finance/documents"));
    expect(listDocuments).toHaveBeenCalledWith("client-1", { docType: undefined });
  });

  it("returns 200 with documents on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const docs = [{ id: "d1" }];
    vi.mocked(listDocuments).mockResolvedValue(docs as never);
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ documents: docs });
  });
});

describe("POST /api/v1/client/finance/documents", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/documents", {
      method: "POST",
      body: JSON.stringify({ docType: "INVOICE" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(createDocument).mockRejectedValue(new ZodError([]));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/documents", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
  });

  it("returns FinanceError status when service throws it", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(createDocument).mockRejectedValue(new FinanceError(422, "limit_reached"));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/documents", {
      method: "POST",
      body: JSON.stringify({ docType: "INVOICE" }),
    }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "limit_reached" });
  });

  it("returns 201 with document on success and uses clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "d1", docType: "INVOICE" };
    vi.mocked(createDocument).mockResolvedValue(doc as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/documents", {
      method: "POST",
      body: JSON.stringify({ docType: "INVOICE" }),
    }));
    expect(res.status).toBe(201);
    expect(createDocument).toHaveBeenCalledWith("client-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ document: doc });
  });
});
