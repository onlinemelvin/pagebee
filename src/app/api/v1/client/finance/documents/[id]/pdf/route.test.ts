import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  getDocumentPdf: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { GET } from "./route";
import { requireClient } from "@/lib/auth/session";
import { getDocumentPdf, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const routeParams = { params: Promise.resolve({ id: "doc-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/documents/[id]/pdf", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1/pdf"), routeParams);
    expect(res.status).toBe(401);
    expect(getDocumentPdf).not.toHaveBeenCalled();
  });

  it("returns 403 when not a client", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1/pdf"), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns FinanceError status when document not found", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: mockClient } as never);
    vi.mocked(getDocumentPdf).mockRejectedValue(new FinanceError(404, "not_found"));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1/pdf"), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns PDF bytes with correct headers on success", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: mockClient } as never);
    const buffer = Buffer.from("%PDF-1.4 fake");
    vi.mocked(getDocumentPdf).mockResolvedValue({ buffer, filename: "invoice-001.pdf" } as never);
    const res = await GET(new Request("http://localhost/api/v1/client/finance/documents/doc-1/pdf"), routeParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("invoice-001.pdf");
    expect(getDocumentPdf).toHaveBeenCalledWith("client-1", "doc-1");
  });
});
