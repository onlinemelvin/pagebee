import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/knowledge", () => ({
  addDocument: vi.fn(),
  kbKindFor: vi.fn(),
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { addDocument, kbKindFor } from "@/lib/modules/knowledge";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFormDataRequest(file?: File): Request {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("http://localhost/api/v1/client/knowledge/documents", {
    method: "POST",
    body: form,
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/client/knowledge/documents", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));

    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(401);
    expect(addDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));

    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is present in the form", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);

    const res = await POST(makeFormDataRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_file");
  });

  it("returns 400 when the file type is unsupported", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);
    vi.mocked(kbKindFor).mockReturnValue(null);

    const file = new File([new Uint8Array(4)], "script.exe", { type: "application/x-msdownload" });
    const res = await POST(makeFormDataRequest(file));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unsupported_type");
  });

  it("returns 400 when the file is too large (> 5 MB)", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);
    vi.mocked(kbKindFor).mockReturnValue("pdf");

    const bigBytes = new Uint8Array(6 * 1024 * 1024); // 6 MB
    const file = new File([bigBytes], "big.pdf", { type: "application/pdf" });
    const res = await POST(makeFormDataRequest(file));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("file_too_large");
  });

  it("returns 400 when addDocument returns an { error } failure", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);
    vi.mocked(kbKindFor).mockReturnValue("pdf");
    vi.mocked(addDocument).mockResolvedValue({ error: "upload_failed" });

    const file = new File([new Uint8Array(8)], "menu.pdf", { type: "application/pdf" });
    const res = await POST(makeFormDataRequest(file));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("upload_failed");
  });

  it("returns 201 with the document DTO on a successful upload", async () => {
    const fakeClient = { id: "c1" };
    vi.mocked(requireCapability).mockResolvedValue({ client: fakeClient } as never);
    vi.mocked(kbKindFor).mockReturnValue("pdf");
    const dto = { id: "doc1", name: "menu.pdf", url: "https://cdn.x/menu.pdf", kind: "pdf", charCount: 120, hasText: true, preview: "Page 1", createdAt: "2024-01-01T00:00:00.000Z" };
    vi.mocked(addDocument).mockResolvedValue(dto);

    const file = new File([new Uint8Array(8)], "menu.pdf", { type: "application/pdf" });
    const res = await POST(makeFormDataRequest(file));

    expect(res.status).toBe(201);
    expect(requireCapability).toHaveBeenCalledWith("website", "manage");
    expect(addDocument).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "menu.pdf", contentType: "application/pdf" }));
    const body = await res.json();
    expect(body.document).toMatchObject({ id: "doc1" });
  });
});
