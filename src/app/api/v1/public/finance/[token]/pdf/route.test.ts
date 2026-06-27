import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/finance", () => ({ getPublicDocumentPdf: vi.fn() }));

import { GET } from "./route";
import { getPublicDocumentPdf } from "@/lib/modules/finance";

const req = () => new Request("http://localhost/api/v1/public/finance/tk/pdf");
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/finance/{token}/pdf", () => {
  it("404 when no document for the token", async () => {
    vi.mocked(getPublicDocumentPdf).mockResolvedValue(null as never);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("500 on an unexpected error", async () => {
    vi.mocked(getPublicDocumentPdf).mockRejectedValue(new Error("boom"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
  });

  it("happy path: streams the pdf with content-type/disposition", async () => {
    vi.mocked(getPublicDocumentPdf).mockResolvedValue({
      buffer: Buffer.from("PDFDATA"),
      filename: "invoice.pdf",
    } as never);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("invoice.pdf");
    expect(getPublicDocumentPdf).toHaveBeenCalledWith("tk");
  });
});
