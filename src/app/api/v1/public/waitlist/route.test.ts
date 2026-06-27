import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import { POST } from "./route";

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/public/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/waitlist", () => {
  it("400 on validation failure (bad email)", async () => {
    const res = await POST(req({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(prismaMock.waitlistEntry.upsert).not.toHaveBeenCalled();
  });

  it("happy path: upserts the entry (idempotent on email)", async () => {
    prismaMock.waitlistEntry.upsert.mockResolvedValue({ id: "we1" });
    const res = await POST(req({ email: "A@B.com", name: "Sam" }, { "x-forwarded-for": "1.2.3.4" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(prismaMock.waitlistEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "a@b.com" } }),
    );
  });
});
