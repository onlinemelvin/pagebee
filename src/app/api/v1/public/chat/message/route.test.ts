import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
const { ChatError } = vi.hoisted(() => ({
  ChatError: class ChatError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/chat", () => ({
  handleCustomerMessage: vi.fn(),
  isChatLive: vi.fn(),
  ChatError,
}));
vi.mock("@/lib/events/subscribers", () => ({}));

import { POST } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { handleCustomerMessage, isChatLive } from "@/lib/modules/chat";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/chat/message", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/chat/message", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(401);
    expect(handleCustomerMessage).not.toHaveBeenCalled();
  });

  it("400 on validation failure (message too long)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    const res = await POST(req({ message: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("preview status returns a non-persisting demo", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "preview" });
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ demo: true });
    expect(handleCustomerMessage).not.toHaveBeenCalled();
  });

  it("403 when chat is not live", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(isChatLive).mockResolvedValue(false);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "chat_disabled" });
  });

  it("happy path: handles the turn scoped to the token's clientId", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(isChatLive).mockResolvedValue(true);
    vi.mocked(handleCustomerMessage).mockResolvedValue({
      conversationId: "cv1",
      publicToken: "pt1",
      status: "ai",
      messages: [],
    } as never);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(200);
    expect(handleCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", message: "hi" }),
    );
  });
});
