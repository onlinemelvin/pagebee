import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { SalesError } from "@/lib/modules/sales";

vi.mock("@/lib/auth/session", () => ({
  requireContractedRep: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadPublicFile: vi.fn(),
}));
vi.mock("@/lib/modules/sales", async () => {
  const actual = await vi.importActual<typeof import("@/lib/modules/sales")>("@/lib/modules/sales");
  return { ...actual, assertRepAssignedToProspect: vi.fn() };
});

import { POST } from "./route";
import { requireContractedRep } from "@/lib/auth/session";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { assertRepAssignedToProspect } from "@/lib/modules/sales";

function makeFile(name: string, type: string, sizeBytes: number) {
  return new File([new Uint8Array(sizeBytes).fill(1)], name, { type });
}

function req(opts: { file?: File | null; prospectId?: string | null }) {
  const form = new FormData();
  if (opts.file) form.append("file", opts.file);
  if (opts.prospectId != null) form.append("prospectId", opts.prospectId);
  return new Request("http://localhost/api/v1/rep/uploads", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireContractedRep).mockResolvedValue({ employee: { id: "rep1" } } as never);
  vi.mocked(assertRepAssignedToProspect).mockResolvedValue(undefined as never);
});

describe("POST /api/v1/rep/uploads", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireContractedRep).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ file: makeFile("logo.png", "image/png", 100), prospectId: "p1" }));
    expect(res.status).toBe(401);
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns 400 when prospectId is missing", async () => {
    const res = await POST(req({ file: makeFile("logo.png", "image/png", 100), prospectId: null }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_prospect" });
  });

  it("returns 404 when the rep isn't assigned to the prospect", async () => {
    vi.mocked(assertRepAssignedToProspect).mockRejectedValue(new SalesError("prospect_not_found", 404));
    const res = await POST(req({ file: makeFile("logo.png", "image/png", 100), prospectId: "p1" }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "prospect_not_found" });
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is attached", async () => {
    const res = await POST(req({ file: null, prospectId: "p1" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_file" });
  });

  it("returns 400 for non-image file type", async () => {
    const res = await POST(req({ file: makeFile("script.js", "application/javascript", 100), prospectId: "p1" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_type" });
  });

  it("returns 400 for file exceeding 5MB", async () => {
    const res = await POST(req({ file: makeFile("big.jpg", "image/jpeg", 5 * 1024 * 1024 + 1), prospectId: "p1" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
  });

  it("returns 500 when upload fails", async () => {
    vi.mocked(uploadPublicFile).mockResolvedValue(null as never);
    const res = await POST(req({ file: makeFile("logo.png", "image/png", 1024), prospectId: "p1" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "upload_failed" });
  });

  it("stores under previews/{prospectId}/ and returns the URL on success", async () => {
    const url = "https://cdn.example.com/previews/p1/abc.png";
    vi.mocked(uploadPublicFile).mockResolvedValue(url);
    const res = await POST(req({ file: makeFile("logo.png", "image/png", 1024), prospectId: "p1" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url });
    expect(uploadPublicFile).toHaveBeenCalledWith(
      expect.stringMatching(/^previews\/p1\//),
      expect.any(ArrayBuffer),
      "image/png",
    );
  });
});
