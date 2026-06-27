import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/notification", () => ({
  getNotificationPrefs: vi.fn(),
  setNotificationPrefs: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/modules/notification";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/notifications/settings", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getNotificationPrefs).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is staff not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns notification prefs on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const prefs = { enabled: true, inquiries: true, appointments: true, billing: false, website: true };
    vi.mocked(getNotificationPrefs).mockResolvedValue(prefs as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs });
    expect(getNotificationPrefs).toHaveBeenCalledWith("client-1");
  });
});

describe("PUT /api/v1/client/notifications/settings", () => {
  const putReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/notifications/settings", {
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

  it("returns 400 for invalid body (wrong type)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const res = await PUT(putReq({ enabled: "yes" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("updates prefs and returns them on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const prefs = { enabled: false, inquiries: true };
    vi.mocked(setNotificationPrefs).mockResolvedValue(prefs as never);

    const res = await PUT(putReq({ enabled: false, inquiries: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs });
    expect(setNotificationPrefs).toHaveBeenCalledWith("client-1", { enabled: false, inquiries: true });
  });

  it("returns 400 for null body (invalid JSON)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const badReq = new Request("http://localhost/api/v1/client/notifications/settings", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(badReq);
    expect(res.status).toBe(400);
  });
});
