import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/media", () => ({
  listMedia: vi.fn(),
  addMedia: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadPublicFile: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listMedia, addMedia } from "@/lib/modules/media";
import { uploadPublicFile } from "@/lib/supabase/storage";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

/** Build a multipart FormData request with a fake image file. */
function makeUploadRequest(opts: {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  name?: string;
  alt?: string;
}) {
  const { fileName = "photo.jpg", fileType = "image/jpeg", fileSize = 1024, name, alt } = opts;
  const bytes = new Uint8Array(fileSize);
  const file = new File([bytes], fileName, { type: fileType });
  const form = new FormData();
  form.set("file", file);
  if (name) form.set("name", name);
  if (alt) form.set("alt", alt);
  return new Request("http://localhost/api/v1/client/media", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/media", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listMedia).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:view", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with items, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const items = [{ id: "m-1", url: "https://cdn.example.com/img.jpg" }];
    vi.mocked(listMedia).mockResolvedValue(items as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items });
    expect(listMedia).toHaveBeenCalledWith("t-99");
  });
});

describe("POST /api/v1/client/media", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(makeUploadRequest({}));
    expect(res.status).toBe(401);
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(makeUploadRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const form = new FormData();
    const req = new Request("http://localhost/", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_file" });
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns 400 when file type is not an image", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const res = await POST(makeUploadRequest({ fileName: "doc.pdf", fileType: "application/pdf" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_type" });
  });

  it("returns 400 when file exceeds 5 MB limit", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const res = await POST(makeUploadRequest({ fileSize: 5 * 1024 * 1024 + 1 }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
  });

  it("returns 500 when upload fails", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(uploadPublicFile).mockResolvedValue(null as never);

    const res = await POST(makeUploadRequest({}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "upload_failed" });
  });

  it("returns 201 with item on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(uploadPublicFile).mockResolvedValue("https://cdn.example.com/t-99/media/abc.jpg" as never);
    const item = { id: "m-1", url: "https://cdn.example.com/t-99/media/abc.jpg", name: "My Photo" };
    vi.mocked(addMedia).mockResolvedValue(item as never);

    const res = await POST(makeUploadRequest({ name: "My Photo", alt: "A nice photo" }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ item });
    expect(addMedia).toHaveBeenCalledWith(
      "t-99",
      expect.objectContaining({ url: "https://cdn.example.com/t-99/media/abc.jpg", kind: "image" }),
    );
  });
});
