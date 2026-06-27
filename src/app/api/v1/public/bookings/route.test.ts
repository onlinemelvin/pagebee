import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
const { BookingError, bookingInputSchema } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted factory runs before ES imports initialize
  const { z } = require("zod");
  return {
    BookingError: class BookingError extends Error {
      constructor(public code: string, public status: number) {
        super(code);
      }
    },
    bookingInputSchema: z.object({
      name: z.string().min(1),
      service: z.string().min(1),
      startAt: z.string().min(1),
    }),
  };
});
vi.mock("@/lib/modules/booking", () => ({
  createBooking: vi.fn(),
  bookingEnabled: vi.fn(),
  bookingInputSchema,
  BookingError,
}));
vi.mock("@/lib/events/subscribers", () => ({}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({ capture: vi.fn() })),
}));

import { POST } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { createBooking, bookingEnabled } from "@/lib/modules/booking";
import { getPostHogClient } from "@/lib/posthog-server";

const valid = { name: "Sam", service: "Cut", startAt: "2026-01-01T10:00:00Z" };
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/bookings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks (global setup) wipes factory implementations — re-apply.
  vi.mocked(getPostHogClient).mockReturnValue({ capture: vi.fn() } as never);
});

describe("POST /api/v1/public/bookings", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("400 on validation failure", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    const res = await POST(req({ name: "Sam" }));
    expect(res.status).toBe(400);
  });

  it("preview status returns a demo, no booking created", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "preview" });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ demo: true });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("403 when booking disabled by the owner", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(false);
    const res = await POST(req(valid));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "booking_disabled" });
  });

  it("maps BookingError to its status/code", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(true);
    vi.mocked(createBooking).mockRejectedValue(new BookingError("slot_taken", 409));
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "slot_taken" });
  });

  it("happy path: creates booking scoped to the token's clientId", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(bookingEnabled).mockResolvedValue(true);
    vi.mocked(createBooking).mockResolvedValue({
      id: "b1",
      status: "PENDING",
      startAt: "2026-01-01T10:00:00Z",
    } as never);
    const res = await POST(req(valid));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: "b1", status: "PENDING" });
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", input: valid }),
    );
  });
});
