import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/chat", () => ({
  listConversations: vi.fn(),
}));

import { GET } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listConversations } from "@/lib/modules/chat";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/chats", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks the inquiries:view capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns conversations list on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    const conversations = [{ id: "conv-1" }, { id: "conv-2" }];
    vi.mocked(listConversations).mockResolvedValue(conversations as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ conversations });
    expect(requireCapability).toHaveBeenCalledWith("inquiries", "view");
    expect(listConversations).toHaveBeenCalledWith("client-1");
  });
});
