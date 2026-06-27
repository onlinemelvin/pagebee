import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
vi.mock("@/lib/modules/booking", () => ({ bookingEnabled: vi.fn() }));
vi.mock("@/lib/modules/website", () => ({ getPreviewPlanOverride: vi.fn() }));
vi.mock("@/lib/site/booking", () => ({ defaultBookingHtml: vi.fn(() => "<default/>") }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { bookingEnabled } from "@/lib/modules/booking";
import { defaultBookingHtml } from "@/lib/site/booking";

const req = (qs = "") =>
  new Request(`http://localhost/api/v1/public/booking${qs}`, {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks (global setup) wipes factory implementations — re-apply.
  vi.mocked(defaultBookingHtml).mockReturnValue("<default/>");
});

describe("GET /api/v1/public/booking", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(bookingEnabled).not.toHaveBeenCalled();
  });

  it("returns enabled:false when booking is off-plan/disabled", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false });
  });

  it("happy path: returns stored bookingHtml for the tenant", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(true);
    prismaMock.website.findFirst.mockResolvedValue({
      publishedVersion: { bookingHtml: "<book/>" },
      versions: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: true, html: "<book/>" });
    expect(prismaMock.website.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("falls back to the platform default when no stored html", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(true);
    prismaMock.website.findFirst.mockResolvedValue({ publishedVersion: null, versions: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: true, html: "<default/>" });
  });
});
