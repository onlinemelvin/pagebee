import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/chat", () => ({
  getChatConfig: vi.fn(),
  setChatConfig: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getChatConfig, setChatConfig } from "@/lib/modules/chat";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/chats/settings", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getChatConfig).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is staff not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the chat config on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const config = { enabled: true, greeting: "Hello!" };
    vi.mocked(getChatConfig).mockResolvedValue(config as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ config });
    expect(getChatConfig).toHaveBeenCalledWith("client-1");
  });
});

describe("PUT /api/v1/client/chats/settings", () => {
  const putReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/chats/settings", {
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

  it("returns 400 for invalid body (escalationTimeoutMinutes out of range)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const res = await PUT(putReq({ escalationTimeoutMinutes: 200 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("updates chat config and returns it on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const config = { enabled: false, greeting: "Hi there" };
    vi.mocked(setChatConfig).mockResolvedValue(config as never);

    const res = await PUT(putReq({ enabled: false, greeting: "Hi there" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ config });
    expect(setChatConfig).toHaveBeenCalledWith("client-1", { enabled: false, greeting: "Hi there" });
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    const badReq = new Request("http://localhost/api/v1/client/chats/settings", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(badReq);
    expect(res.status).toBe(400);
  });
});
