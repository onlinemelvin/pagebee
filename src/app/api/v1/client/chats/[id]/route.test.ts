import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/chat", () => ({
  getConversation: vi.fn(),
  ownerReply: vi.fn(),
  draftReply: vi.fn(),
  closeConversation: vi.fn(),
  ChatError: class ChatError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getConversation, ownerReply, draftReply, closeConversation, ChatError } from "@/lib/modules/chat";

const params = (id = "conv-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/chats/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/chats/conv-1"), params());
    expect(res.status).toBe(401);
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking inquiries:view capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/chats/conv-1"), params());
    expect(res.status).toBe(403);
  });

  it("returns 404 when conversation not found", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    vi.mocked(getConversation).mockResolvedValue(null as never);

    const res = await GET(new Request("http://localhost/api/v1/client/chats/conv-1"), params("conv-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns the conversation on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    const conv = { id: "conv-1", messages: [] };
    vi.mocked(getConversation).mockResolvedValue(conv as never);

    const res = await GET(new Request("http://localhost/api/v1/client/chats/conv-1"), params("conv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ conversation: conv });
    expect(getConversation).toHaveBeenCalledWith("client-1", "conv-1");
  });
});

describe("POST /api/v1/client/chats/[id]", () => {
  const postReq = (body: unknown, id = "conv-1") =>
    new Request(`http://localhost/api/v1/client/chats/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ action: "close" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking inquiries:manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(postReq({ action: "close" }), params());
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    const res = await POST(postReq({ action: "invalid" }), params());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("closes conversation and returns ok", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    vi.mocked(closeConversation).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ action: "close" }), params("conv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(closeConversation).toHaveBeenCalledWith("client-1", "conv-1");
  });

  it("calls draftReply and returns the draft", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    const draft = { message: "Suggested reply" };
    vi.mocked(draftReply).mockResolvedValue(draft as never);

    const res = await POST(postReq({ action: "draft" }), params("conv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(draft);
    expect(draftReply).toHaveBeenCalledWith("client-1", "conv-1");
  });

  it("sends reply and returns the message", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    const msg = { id: "msg-1", content: "Hello" };
    vi.mocked(ownerReply).mockResolvedValue(msg as never);

    const res = await POST(postReq({ action: "reply", message: "Hello" }), params("conv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, message: msg });
    expect(ownerReply).toHaveBeenCalledWith("client-1", "conv-1", "Hello");
  });

  it("returns ChatError status on chat error", async () => {
    vi.mocked(requireCapability).mockResolvedValue(mockResult as never);
    vi.mocked(closeConversation).mockRejectedValue(new ChatError(409, "already_closed"));

    const res = await POST(postReq({ action: "close" }), params("conv-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_closed");
  });
});
