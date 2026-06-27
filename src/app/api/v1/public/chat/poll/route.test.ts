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
vi.mock("@/lib/modules/chat", () => ({ pollMessages: vi.fn(), ChatError }));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { pollMessages } from "@/lib/modules/chat";

const req = (qs = "") =>
  new Request(`http://localhost/api/v1/public/chat/poll${qs}`, {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/chat/poll", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req("?conversationId=cv1&publicToken=pt1"));
    expect(res.status).toBe(401);
    expect(pollMessages).not.toHaveBeenCalled();
  });

  it("400 when conversationId/publicToken are missing", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    const res = await GET(req("?conversationId=cv1"));
    expect(res.status).toBe(400);
    expect(pollMessages).not.toHaveBeenCalled();
  });

  it("maps ChatError to its status/code", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(pollMessages).mockRejectedValue(new ChatError("forbidden", 403));
    const res = await GET(req("?conversationId=cv1&publicToken=pt1"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("happy path: returns polled messages", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(pollMessages).mockResolvedValue({ messages: [{ id: "m1" }] } as never);
    const res = await GET(req("?conversationId=cv1&publicToken=pt1&after=2026-01-01"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ messages: [{ id: "m1" }] });
    expect(pollMessages).toHaveBeenCalledWith({
      conversationId: "cv1",
      publicToken: "pt1",
      after: "2026-01-01",
    });
  });
});
