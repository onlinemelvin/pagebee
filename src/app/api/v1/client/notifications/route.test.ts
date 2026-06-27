import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/notification", () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { listNotifications, markRead, markAllRead } from "@/lib/modules/notification";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("returns notifications on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const data = { items: [{ id: "n1" }], unread: 1 };
    vi.mocked(listNotifications).mockResolvedValue(data as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(data);
    expect(listNotifications).toHaveBeenCalledWith("client-1");
  });
});

describe("POST /api/v1/client/notifications", () => {
  const postReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/notifications", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ all: true }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (empty ids array)", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const res = await POST(postReq({ ids: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for invalid body (neither all nor ids)", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const res = await POST(postReq({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  it("marks all notifications read when { all: true }", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(markAllRead).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ all: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(markAllRead).toHaveBeenCalledWith("client-1");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("marks specific notifications read when ids provided", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(markRead).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ ids: ["n1", "n2"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(markRead).toHaveBeenCalledWith("client-1", ["n1", "n2"]);
    expect(markAllRead).not.toHaveBeenCalled();
  });
});
