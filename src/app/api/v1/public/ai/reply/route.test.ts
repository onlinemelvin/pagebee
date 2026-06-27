import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
const { MessagingError } = vi.hoisted(() => ({
  MessagingError: class MessagingError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/messaging", () => ({ sendAiReply: vi.fn(), MessagingError }));

import { POST } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { sendAiReply } from "@/lib/modules/messaging";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/ai/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/ai/reply", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(401);
    expect(sendAiReply).not.toHaveBeenCalled();
  });

  it("400 on validation failure (empty message)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    const res = await POST(req({ message: "" }));
    expect(res.status).toBe(400);
    expect(sendAiReply).not.toHaveBeenCalled();
  });

  it("maps MessagingError to its status/code", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(sendAiReply).mockRejectedValue(new MessagingError("quota_exceeded", 429));
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "quota_exceeded" });
  });

  it("happy path: replies and calls service with the token's clientId", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(sendAiReply).mockResolvedValue({ reply: "hello" } as never);
    const res = await POST(req({ message: "hi", history: [{ role: "user", content: "x" }] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reply: "hello" });
    expect(sendAiReply).toHaveBeenCalledWith("c1", "hi", [{ role: "user", content: "x" }]);
  });
});
