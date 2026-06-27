import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import { listMedia, addMedia, setMediaGallery, deleteMedia } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-01T00:00:00Z");

function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    clientId: "c1",
    url: "https://cdn.example.com/img.jpg",
    name: "Hero image",
    alt: "A beautiful salon",
    kind: "image",
    inGallery: true,
    createdAt: NOW,
    ...overrides,
  };
}

// ── listMedia ─────────────────────────────────────────────────────────────────

describe("listMedia", () => {
  it("returns a DTO array scoped to the tenant", async () => {
    prismaMock.clientMedia.findMany.mockResolvedValue([makeMedia() as never]);
    const result = await listMedia("c1");
    expect(prismaMock.clientMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("maps createdAt to ISO string in the DTO", async () => {
    prismaMock.clientMedia.findMany.mockResolvedValue([makeMedia() as never]);
    const [item] = await listMedia("c1");
    expect(typeof item.createdAt).toBe("string");
    expect(item.createdAt).toBe(NOW.toISOString());
  });

  it("returns empty array when client has no media", async () => {
    prismaMock.clientMedia.findMany.mockResolvedValue([]);
    expect(await listMedia("c1")).toHaveLength(0);
  });

  it("does not leak another tenant's media (IDOR check)", async () => {
    prismaMock.clientMedia.findMany.mockResolvedValue([]);
    await listMedia("c2");
    expect(prismaMock.clientMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c2" } }),
    );
  });
});

// ── addMedia ──────────────────────────────────────────────────────────────────

describe("addMedia", () => {
  it("persists with the correct clientId and returns a DTO", async () => {
    prismaMock.clientMedia.create.mockResolvedValue(makeMedia() as never);
    const result = await addMedia("c1", { url: "https://cdn.example.com/img.jpg" });
    expect(prismaMock.clientMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", url: "https://cdn.example.com/img.jpg" }),
      }),
    );
    expect(result.url).toBe("https://cdn.example.com/img.jpg");
  });

  it("defaults kind to 'image' when not supplied", async () => {
    prismaMock.clientMedia.create.mockResolvedValue(makeMedia() as never);
    await addMedia("c1", { url: "https://cdn.example.com/img.jpg" });
    expect(prismaMock.clientMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "image" }) }),
    );
  });

  it("defaults inGallery to true when not supplied", async () => {
    prismaMock.clientMedia.create.mockResolvedValue(makeMedia() as never);
    await addMedia("c1", { url: "https://cdn.example.com/img.jpg" });
    expect(prismaMock.clientMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ inGallery: true }) }),
    );
  });

  it("respects explicit inGallery:false", async () => {
    prismaMock.clientMedia.create.mockResolvedValue(makeMedia({ inGallery: false }) as never);
    await addMedia("c1", { url: "https://cdn.example.com/img.jpg", inGallery: false });
    expect(prismaMock.clientMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ inGallery: false }) }),
    );
  });

  it("stores null for name/alt when not provided", async () => {
    prismaMock.clientMedia.create.mockResolvedValue(makeMedia({ name: null, alt: null }) as never);
    await addMedia("c1", { url: "https://cdn.example.com/img.jpg" });
    expect(prismaMock.clientMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: null, alt: null }) }),
    );
  });
});

// ── setMediaGallery ───────────────────────────────────────────────────────────

describe("setMediaGallery", () => {
  it("returns true when the update matched a record owned by the tenant", async () => {
    prismaMock.clientMedia.updateMany.mockResolvedValue({ count: 1 });
    const result = await setMediaGallery("c1", "m1", false);
    expect(result).toBe(true);
    expect(prismaMock.clientMedia.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", clientId: "c1" },
      data: { inGallery: false },
    });
  });

  it("returns false when no record matched (not found or wrong tenant — IDOR guard)", async () => {
    prismaMock.clientMedia.updateMany.mockResolvedValue({ count: 0 });
    const result = await setMediaGallery("c1", "m-other", true);
    expect(result).toBe(false);
  });

  it("scopes to clientId so tenant B cannot toggle tenant A's media", async () => {
    prismaMock.clientMedia.updateMany.mockResolvedValue({ count: 0 });
    await setMediaGallery("c2", "m1", true);
    expect(prismaMock.clientMedia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c2", id: "m1" }) }),
    );
  });
});

// ── deleteMedia ───────────────────────────────────────────────────────────────

describe("deleteMedia", () => {
  it("returns true when the delete matched a record owned by the tenant", async () => {
    prismaMock.clientMedia.deleteMany.mockResolvedValue({ count: 1 });
    const result = await deleteMedia("c1", "m1");
    expect(result).toBe(true);
    expect(prismaMock.clientMedia.deleteMany).toHaveBeenCalledWith({ where: { id: "m1", clientId: "c1" } });
  });

  it("returns false when no record matched (not found or wrong tenant — IDOR guard)", async () => {
    prismaMock.clientMedia.deleteMany.mockResolvedValue({ count: 0 });
    const result = await deleteMedia("c1", "m-other");
    expect(result).toBe(false);
  });
});
