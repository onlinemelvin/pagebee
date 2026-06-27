import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
vi.mock("@/lib/modules/website", () => ({ getPreviewPlanOverride: vi.fn() }));
vi.mock("@/lib/modules/chat", () => ({ isChatLive: vi.fn(), getChatConfig: vi.fn() }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { isChatLive, getChatConfig } from "@/lib/modules/chat";

const req = (qs = "") =>
  new Request(`http://localhost/api/v1/public/chat/config${qs}`, {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/chat/config", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(isChatLive).not.toHaveBeenCalled();
  });

  it("returns enabled:false when chat is not live", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(isChatLive).mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false });
    expect(getChatConfig).not.toHaveBeenCalled();
  });

  it("happy path: returns greeting for the tenant", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(isChatLive).mockResolvedValue(true);
    vi.mocked(getChatConfig).mockResolvedValue({ greeting: "Hi there" } as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: true, greeting: "Hi there" });
    expect(isChatLive).toHaveBeenCalledWith("c1", undefined);
    expect(getChatConfig).toHaveBeenCalledWith("c1");
  });
});
