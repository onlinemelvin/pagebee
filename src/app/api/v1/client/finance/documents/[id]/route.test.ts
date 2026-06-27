import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { GET, PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getDocument, updateDocument, deleteDocument, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };
const routeParams = { params: Promise.resolve({ id: "doc-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/documents/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1"), routeParams);
    expect(res.status).toBe(401);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1"), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns FinanceError status when document not found", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(getDocument).mockRejectedValue(new FinanceError(404, "not_found"));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1"), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 200 with document on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1" };
    vi.mocked(getDocument).mockResolvedValue(doc as never);
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1"), routeParams);
    expect(res.status).toBe(200);
    expect(getDocument).toHaveBeenCalledWith("client-1", "doc-1");
    await expect(res.json()).resolves.toEqual({ document: doc });
  });
});

describe("PATCH /api/v1/client/finance/documents/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on ZodError", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(updateDocument).mockRejectedValue(new ZodError([]));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(updateDocument).mockRejectedValue(new FinanceError(409, "status_conflict"));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(409);
  });

  it("returns 200 with updated document on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1", status: "SENT" };
    vi.mocked(updateDocument).mockResolvedValue(doc as never);
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "PATCH", body: JSON.stringify({ status: "SENT" }) }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(updateDocument).toHaveBeenCalledWith("client-1", "doc-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ document: doc });
  });
});

describe("DELETE /api/v1/client/finance/documents/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "DELETE" }), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteDocument).mockRejectedValue(new FinanceError(409, "cannot_delete_paid"));
    const res = await DELETE(new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "DELETE" }), routeParams);
    expect(res.status).toBe(409);
  });

  it("returns 200 ok on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteDocument).mockResolvedValue(undefined as never);
    const res = await DELETE(new Request("http://localhost/api/v1/client/finance/documents/doc-1", { method: "DELETE" }), routeParams);
    expect(res.status).toBe(200);
    expect(deleteDocument).toHaveBeenCalledWith("client-1", "doc-1");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
