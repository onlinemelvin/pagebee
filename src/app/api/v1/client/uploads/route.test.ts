import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadPublicFile: vi.fn(),
}));

import { POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { uploadPublicFile } from "@/lib/supabase/storage";

const makeClient = (id = "c1") => ({ id });

/** Build a multipart Request with an attached file */
function fileReq(file: File | null) {
  if (!file) {
    // no file attached at all — send empty form
    const form = new FormData();
    return new Request("http://localhost/api/v1/client/uploads", { method: "POST", body: form });
  }
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/v1/client/uploads", { method: "POST", body: form });
}

function makeFile(name: string, type: string, sizeBytes: number) {
  const content = new Uint8Array(sizeBytes).fill(1);
  return new File([content], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/uploads", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(fileReq(makeFile("logo.png", "image/png", 100)));
    expect(res.status).toBe(401);
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns 402 for inactive account", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(402, "subscription_inactive"));
    const res = await POST(fileReq(makeFile("logo.png", "image/png", 100)));
    expect(res.status).toBe(402);
  });

  it("returns 400 when no file is attached", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const res = await POST(fileReq(null));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_file" });
  });

  it("returns 400 for non-image file type", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const res = await POST(fileReq(makeFile("script.js", "application/javascript", 100)));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_type" });
  });

  it("returns 400 for file exceeding 5MB", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const oversized = makeFile("big.jpg", "image/jpeg", 5 * 1024 * 1024 + 1);
    const res = await POST(fileReq(oversized));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
  });

  it("returns 500 when upload fails", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(uploadPublicFile).mockResolvedValue(null as never);
    const res = await POST(fileReq(makeFile("logo.png", "image/png", 1024)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "upload_failed" });
  });

  it("returns uploaded URL on success", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    const url = "https://cdn.example.com/c1/abc123.png";
    vi.mocked(uploadPublicFile).mockResolvedValue(url);
    const res = await POST(fileReq(makeFile("logo.png", "image/png", 1024)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url });
    // Path should be prefixed with clientId
    expect(uploadPublicFile).toHaveBeenCalledWith(
      expect.stringMatching(/^c1\//),
      expect.any(ArrayBuffer),
      "image/png",
    );
  });

  it("accepts jpeg files", async () => {
    vi.mocked(requireClient).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(uploadPublicFile).mockResolvedValue("https://cdn.example.com/c1/abc.jpg");
    const res = await POST(fileReq(makeFile("photo.jpg", "image/jpeg", 2048)));
    expect(res.status).toBe(200);
  });
});
