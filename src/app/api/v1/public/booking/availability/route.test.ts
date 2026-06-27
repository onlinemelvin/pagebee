import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
const { BookingError } = vi.hoisted(() => ({
  BookingError: class BookingError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/booking", () => ({ getAvailability: vi.fn(), BookingError }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { getAvailability } from "@/lib/modules/booking";

const req = (qs = "") =>
  new Request(`http://localhost/api/v1/public/booking/availability${qs}`, {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/booking/availability", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("maps BookingError to its status/code (plan gate)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(getAvailability).mockRejectedValue(new BookingError("plan_required", 403));
    const res = await GET(req());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "plan_required" });
  });

  it("happy path: returns slots, passes clientId + service", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(getAvailability).mockResolvedValue([{ at: "2026-01-01" }] as never);
    const res = await GET(req("?service=Haircut"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slots: [{ at: "2026-01-01" }] });
    expect(getAvailability).toHaveBeenCalledWith("c1", "Haircut");
  });
});
