import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/media", () => ({
  deleteMedia: vi.fn(),
  setMediaGallery: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { deleteMedia, setMediaGallery } from "@/lib/modules/media";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "m-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/media/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ inGallery: true }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(setMediaGallery).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ inGallery: true }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when inGallery is missing", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({}) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(setMediaGallery).not.toHaveBeenCalled();
  });

  it("returns 400 when inGallery is not a boolean", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ inGallery: "yes" }) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when media item not found", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(setMediaGallery).mockResolvedValue(false as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ inGallery: true }) }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(setMediaGallery).mockResolvedValue(true as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ inGallery: false }) }),
      makeParams("m-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(setMediaGallery).toHaveBeenCalledWith("t-99", "m-1", false);
  });
});

describe("DELETE /api/v1/client/media/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(401);
    expect(deleteMedia).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 404 when media item not found", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(deleteMedia).mockResolvedValue(false as never);

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(deleteMedia).mockResolvedValue(true as never);

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("m-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteMedia).toHaveBeenCalledWith("t-99", "m-1");
  });
});
