import { describe, it, expect, vi, beforeEach } from "vitest";

const { AuthFlowError } = vi.hoisted(() => ({
  AuthFlowError: class AuthFlowError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/lib/modules/auth", () => ({ resetPassword: vi.fn(), AuthFlowError }));

import { POST } from "./route";
import { resetPassword } from "@/lib/modules/auth";

const valid = { token: "tok1234567890", password: "password1" };
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/reset-password", () => {
  it("400 on validation failure (short password)", async () => {
    const res = await POST(req({ token: "tok1234567890", password: "x" }));
    expect(res.status).toBe(400);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("maps AuthFlowError to its status/code (expired token)", async () => {
    vi.mocked(resetPassword).mockRejectedValue(new AuthFlowError("token_expired", 410));
    const res = await POST(req(valid));
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({ error: "token_expired" });
  });

  it("happy path: consumes the token + sets the password", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined as never);
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(resetPassword).toHaveBeenCalledWith("tok1234567890", "password1");
  });
});
