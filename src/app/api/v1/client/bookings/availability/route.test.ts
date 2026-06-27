import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/booking", () => ({
  getOwnerSlots: vi.fn(),
  BookingError: class BookingError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { GET } from "./route";
import { requireClient } from "@/lib/auth/session";
import { getOwnerSlots, BookingError } from "@/lib/modules/booking";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/bookings/availability", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/bookings/availability"));
    expect(res.status).toBe(401);
    expect(getOwnerSlots).not.toHaveBeenCalled();
  });

  it("returns 402 when account is inactive", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(402));
    const res = await GET(new Request("http://localhost/api/v1/client/bookings/availability"));
    expect(res.status).toBe(402);
  });

  it("passes service and date query params to getOwnerSlots scoped by clientId", async () => {
    vi.mocked(requireClient).mockResolvedValue(makeCtx() as never);
    vi.mocked(getOwnerSlots).mockResolvedValue([] as never);

    await GET(
      new Request("http://localhost/api/v1/client/bookings/availability?service=svc-1&date=2026-07-01"),
    );
    expect(getOwnerSlots).toHaveBeenCalledWith("client-1", { service: "svc-1", date: "2026-07-01" });
  });

  it("passes undefined for missing query params", async () => {
    vi.mocked(requireClient).mockResolvedValue(makeCtx() as never);
    vi.mocked(getOwnerSlots).mockResolvedValue([] as never);

    await GET(new Request("http://localhost/api/v1/client/bookings/availability"));
    expect(getOwnerSlots).toHaveBeenCalledWith("client-1", { service: undefined, date: undefined });
  });

  it("returns BookingError status when service throws", async () => {
    vi.mocked(requireClient).mockResolvedValue(makeCtx() as never);
    vi.mocked(getOwnerSlots).mockRejectedValue(new BookingError(403, "feature_not_enabled"));

    const res = await GET(new Request("http://localhost/api/v1/client/bookings/availability"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "feature_not_enabled" });
  });

  it("returns 200 with days on success, scoped by guard clientId", async () => {
    vi.mocked(requireClient).mockResolvedValue(makeCtx("t-99") as never);
    const days = [{ date: "2026-07-01", slots: [] }];
    vi.mocked(getOwnerSlots).mockResolvedValue(days as never);

    const res = await GET(new Request("http://localhost/api/v1/client/bookings/availability"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ days });
    expect(getOwnerSlots).toHaveBeenCalledWith("t-99", expect.anything());
  });
});
