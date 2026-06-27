import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/finance", () => ({ decideByToken: vi.fn() }));

import { POST } from "./route";
import { decideByToken } from "@/lib/modules/finance";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/finance/tk/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ token: "tk" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/finance/{token}/decision", () => {
  it("400 on an invalid decision value", async () => {
    const res = await POST(req({ decision: "MAYBE" }), ctx);
    expect(res.status).toBe(400);
    expect(decideByToken).not.toHaveBeenCalled();
  });

  it("404 when the token is not found", async () => {
    vi.mocked(decideByToken).mockResolvedValue(false as never);
    const res = await POST(req({ decision: "ACCEPTED" }), ctx);
    expect(res.status).toBe(404);
  });

  it("happy path: records the decision for the token", async () => {
    vi.mocked(decideByToken).mockResolvedValue(true as never);
    const res = await POST(req({ decision: "DECLINED" }), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(decideByToken).toHaveBeenCalledWith("tk", "DECLINED");
  });
});
