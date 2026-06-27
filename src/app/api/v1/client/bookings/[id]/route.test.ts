import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/booking", () => ({
  updateBookingStatus: vi.fn(),
  rescheduleBooking: vi.fn(),
  deleteBooking: vi.fn(),
  getBookingHistory: vi.fn(),
  rescheduleSchema: {
    safeParse: vi.fn(),
  },
  BookingError: class BookingError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { GET, PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import {
  updateBookingStatus,
  rescheduleBooking,
  deleteBooking,
  getBookingHistory,
  rescheduleSchema,
  BookingError,
} from "@/lib/modules/booking";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "bk-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/bookings/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/"), makeParams());
    expect(res.status).toBe(401);
    expect(getBookingHistory).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking appointments:view", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/"), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns BookingError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getBookingHistory).mockRejectedValue(new BookingError(404, "booking_not_found"));

    const res = await GET(new Request("http://localhost/"), makeParams("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "booking_not_found" });
  });

  it("returns 200 with history, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const history = [{ action: "CREATED", at: "2026-07-01T10:00:00Z" }];
    vi.mocked(getBookingHistory).mockResolvedValue(history as never);

    const res = await GET(new Request("http://localhost/"), makeParams("bk-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ history });
    expect(getBookingHistory).toHaveBeenCalledWith("t-99", "bk-1");
  });
});

describe("PATCH /api/v1/client/bookings/[id] — status change", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when status is invalid", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "INVALID" }) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 200 with booking after status update, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const booking = { id: "bk-1", status: "CONFIRMED" };
    vi.mocked(updateBookingStatus).mockResolvedValue(booking as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }),
      makeParams("bk-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ booking });
    expect(updateBookingStatus).toHaveBeenCalledWith("t-99", "bk-1", "CONFIRMED");
  });
});

describe("PATCH /api/v1/client/bookings/[id] — reschedule", () => {
  it("returns 400 when reschedule payload is invalid", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(rescheduleSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        body: JSON.stringify({ startAt: "not-a-date" }),
      }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with booking after reschedule, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(rescheduleSchema.safeParse).mockReturnValue({
      success: true,
      data: { startAt: "2026-07-02T10:00:00Z", endAt: undefined, reason: undefined },
    } as never);
    const booking = { id: "bk-1", startAt: "2026-07-02T10:00:00Z" };
    vi.mocked(rescheduleBooking).mockResolvedValue(booking as never);

    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        body: JSON.stringify({ startAt: "2026-07-02T10:00:00Z" }),
      }),
      makeParams("bk-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ booking });
    expect(rescheduleBooking).toHaveBeenCalledWith("t-99", "bk-1", "2026-07-02T10:00:00Z", undefined, undefined);
  });
});

describe("DELETE /api/v1/client/bookings/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(401);
    expect(deleteBooking).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking appointments:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns BookingError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(deleteBooking).mockRejectedValue(new BookingError(404, "booking_not_found"));

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "booking_not_found" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(deleteBooking).mockResolvedValue(undefined as never);

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("bk-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteBooking).toHaveBeenCalledWith("t-99", "bk-1");
  });
});
