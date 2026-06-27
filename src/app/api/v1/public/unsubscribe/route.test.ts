import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/email", () => ({
  unsubscribe: vi.fn(),
  resubscribe: vi.fn(),
  resolveUnsubscribeToken: vi.fn(),
}));

import { GET, POST } from "./route";
import { unsubscribe, resubscribe, resolveUnsubscribeToken } from "@/lib/modules/email";

const get = (qs = "") => new Request(`http://localhost/api/v1/public/unsubscribe${qs}`);
const post = (qs: string, body: unknown) =>
  new Request(`http://localhost/api/v1/public/unsubscribe${qs}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/unsubscribe", () => {
  it("400 when token is missing", async () => {
    const res = await GET(get());
    expect(res.status).toBe(400);
  });

  it("404 when the token does not resolve", async () => {
    vi.mocked(resolveUnsubscribeToken).mockResolvedValue(null as never);
    const res = await GET(get("?token=bad"));
    expect(res.status).toBe(404);
  });

  it("happy path: resolves token to its address", async () => {
    vi.mocked(resolveUnsubscribeToken).mockResolvedValue({ email: "a@b.com" } as never);
    const res = await GET(get("?token=good"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ email: "a@b.com" });
  });
});

describe("POST /api/v1/public/unsubscribe", () => {
  it("400 when token is missing", async () => {
    const res = await POST(post("", {}));
    expect(res.status).toBe(400);
  });

  it("resubscribe re-grants consent", async () => {
    vi.mocked(resolveUnsubscribeToken).mockResolvedValue({ email: "a@b.com" } as never);
    vi.mocked(resubscribe).mockResolvedValue(undefined as never);
    const res = await POST(post("?token=good", { action: "resubscribe" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ state: "subscribed" });
    expect(resubscribe).toHaveBeenCalledWith("a@b.com");
  });

  it("404 on an invalid token (unsubscribe)", async () => {
    vi.mocked(unsubscribe).mockResolvedValue(null as never);
    const res = await POST(post("?token=bad", {}));
    expect(res.status).toBe(404);
  });

  it("happy path: unsubscribes the address", async () => {
    vi.mocked(unsubscribe).mockResolvedValue({ email: "a@b.com" } as never);
    const res = await POST(post("?token=good", {}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ state: "unsubscribed", email: "a@b.com" });
    expect(unsubscribe).toHaveBeenCalledWith("good", { reason: "user" });
  });
});
