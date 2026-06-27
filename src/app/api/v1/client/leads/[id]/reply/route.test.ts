import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/lead", () => ({
  replyToLead: vi.fn(),
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { replyToLead } from "@/lib/modules/lead";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "lead-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/leads/[id]/reply", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ message: "Hello" }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(replyToLead).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking inquiries:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ message: "Hello" }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when message is missing", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(replyToLead).not.toHaveBeenCalled();
  });

  it("returns 400 when message is empty string", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ message: "   " }) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when replyToLead throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(replyToLead).mockRejectedValue(new Error("lead_not_found"));

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ message: "Hello" }) }),
      makeParams("lead-1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "lead_not_found" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(replyToLead).mockResolvedValue(undefined as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ message: "Hello there" }) }),
      makeParams("lead-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(replyToLead).toHaveBeenCalledWith("t-99", "lead-1", "Hello there");
  });
});
