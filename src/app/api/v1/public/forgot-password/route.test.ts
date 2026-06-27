import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/auth", () => ({ requestPasswordReset: vi.fn() }));

import { POST } from "./route";
import { requestPasswordReset } from "@/lib/modules/auth";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/forgot-password", () => {
  it("400 on validation failure (bad email)", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns 200 even when the service throws (no enumeration)", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(new Error("boom"));
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("happy path: requests the reset for the email", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined as never);
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(requestPasswordReset).toHaveBeenCalledWith("a@b.com");
  });
});
