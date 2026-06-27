import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
vi.mock("@/lib/modules/service", () => ({
  listWebsiteServices: vi.fn(),
  serviceDurationLabel: vi.fn(() => "30 min"),
  getServiceDisplay: vi.fn(),
}));
vi.mock("@/lib/site/service-icon-svg", () => ({ serviceIconSvg: vi.fn(() => "<svg/>") }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { listWebsiteServices, getServiceDisplay } from "@/lib/modules/service";

const req = () =>
  new Request("http://localhost/api/v1/public/services", {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/services", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listWebsiteServices).not.toHaveBeenCalled();
  });

  it("500 when the service layer throws", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(listWebsiteServices).mockRejectedValue(new Error("boom"));
    vi.mocked(getServiceDisplay).mockResolvedValue({ showPrice: true, showDuration: true } as never);
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it("happy path: returns render-ready services for the tenant", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(listWebsiteServices).mockResolvedValue([
      { id: "s1", title: "Cut", description: "d", icon: "scissors", durationMinutes: 30, price: 5000 },
    ] as never);
    vi.mocked(getServiceDisplay).mockResolvedValue({ showPrice: true, showDuration: false } as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.showPrice).toBe(true);
    expect(body.showDuration).toBe(false);
    expect(body.services[0]).toMatchObject({ id: "s1", title: "Cut", priceLabel: "$50.00" });
    expect(listWebsiteServices).toHaveBeenCalledWith("c1");
    expect(getServiceDisplay).toHaveBeenCalledWith("c1");
  });
});
