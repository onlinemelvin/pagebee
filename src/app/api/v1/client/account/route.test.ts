import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));

import { PATCH } from "./route";
import { requireClient } from "@/lib/auth/session";
import { prismaMock } from "@/test/setup";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/account", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockClientResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("PATCH /api/v1/client/account", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await PATCH(req({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockClientResult as never);
    const res = await PATCH(req({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for name exceeding 120 chars", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockClientResult as never);
    const res = await PATCH(req({ name: "a".repeat(121) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockClientResult as never);
    const res = await PATCH(req({ name: "   " }));
    expect(res.status).toBe(400);
  });

  it("updates the user name and returns ok on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockClientResult as never);
    prismaMock.user.update.mockResolvedValue({ id: "user-1", name: "Alice" } as never);

    const res = await PATCH(req({ name: "Alice" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, name: "Alice" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Alice" },
    });
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockClientResult as never);
    const badReq = new Request("http://localhost/api/v1/client/account", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(badReq);
    expect(res.status).toBe(400);
  });
});
