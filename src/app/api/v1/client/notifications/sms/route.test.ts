import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/messaging", () => ({
  getSmsPrefs: vi.fn(),
  setSmsPrefs: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getSmsPrefs, setSmsPrefs } from "@/lib/modules/messaging";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/notifications/sms", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getSmsPrefs).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is staff not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns sms prefs on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const prefs = { enabled: true, phone: "+15551234567", inquiries: true, appointments: false };
    vi.mocked(getSmsPrefs).mockResolvedValue(prefs as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs });
    expect(getSmsPrefs).toHaveBeenCalledWith("client-1");
  });
});

describe("PUT /api/v1/client/notifications/sms", () => {
  const putReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/notifications/sms", {
      method: "PUT",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await PUT(putReq({ enabled: true }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is staff not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await PUT(putReq({ enabled: true }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (phone too long)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const res = await PUT(putReq({ phone: "1".repeat(31) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("updates sms prefs and returns them on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const prefs = { enabled: true, phone: "+15551234567", inquiries: true, appointments: false };
    vi.mocked(setSmsPrefs).mockResolvedValue(prefs as never);

    const res = await PUT(putReq({ enabled: true, phone: "+15551234567", inquiries: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs });
    expect(setSmsPrefs).toHaveBeenCalledWith("client-1", { enabled: true, phone: "+15551234567", inquiries: true });
  });

  it("returns 400 for null/bad JSON body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const badReq = new Request("http://localhost/api/v1/client/notifications/sms", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(badReq);
    expect(res.status).toBe(400);
  });
});
