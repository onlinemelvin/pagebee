import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/booking", () => ({
  createManualBooking: vi.fn(),
  manualBookingSchema: {
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

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { createManualBooking, manualBookingSchema, BookingError } from "@/lib/modules/booking";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const validBookingData = {
  serviceId: "svc-1",
  startAt: "2026-07-01T10:00:00Z",
  customerName: "Alice",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/bookings", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    vi.mocked(manualBookingSchema.safeParse).mockReturnValue({ success: true, data: validBookingData } as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify(validBookingData) }),
    );
    expect(res.status).toBe(401);
    expect(createManualBooking).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking appointments:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    vi.mocked(manualBookingSchema.safeParse).mockReturnValue({ success: true, data: validBookingData } as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify(validBookingData) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when body fails schema validation", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(manualBookingSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(createManualBooking).not.toHaveBeenCalled();
  });

  it("returns BookingError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(manualBookingSchema.safeParse).mockReturnValue({ success: true, data: validBookingData } as never);
    vi.mocked(createManualBooking).mockRejectedValue(new BookingError(403, "feature_not_enabled"));

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify(validBookingData) }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "feature_not_enabled" });
  });

  it("returns 201 with booking on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(manualBookingSchema.safeParse).mockReturnValue({ success: true, data: validBookingData } as never);
    const booking = { id: "bk-1", ...validBookingData };
    vi.mocked(createManualBooking).mockResolvedValue(booking as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify(validBookingData) }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ booking });
    expect(createManualBooking).toHaveBeenCalledWith("t-99", validBookingData);
  });
});
