import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
vi.mock("@/lib/modules/media", () => ({ listMedia: vi.fn() }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { listMedia } from "@/lib/modules/media";

const req = () =>
  new Request("http://localhost/api/v1/public/gallery", {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/gallery", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listMedia).not.toHaveBeenCalled();
  });

  it("returns enabled:false when the gallery feature is off", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false, images: [] });
    expect(listMedia).not.toHaveBeenCalled();
  });

  it("happy path: returns gallery images for the tenant", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    vi.mocked(listMedia).mockResolvedValue([
      { url: "u1", alt: "a1", kind: "image", inGallery: true },
      { url: "logo", kind: "logo", inGallery: true },
    ] as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: true,
      images: [{ url: "u1", alt: "a1" }],
    });
    expect(listMedia).toHaveBeenCalledWith("c1");
  });
});
