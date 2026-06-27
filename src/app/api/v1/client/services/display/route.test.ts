import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/service", () => ({
  setServiceDisplay: vi.fn(),
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { setServiceDisplay } from "@/lib/modules/service";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/services/display", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ showPrice: true }) }),
    );
    expect(res.status).toBe(401);
    expect(setServiceDisplay).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ showPrice: true }) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when body fails schema validation (non-boolean)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ showPrice: "yes" }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(setServiceDisplay).not.toHaveBeenCalled();
  });

  it("accepts empty body (all fields optional)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(setServiceDisplay).mockResolvedValue({ showPrice: false, showDuration: false } as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(200);
    expect(setServiceDisplay).toHaveBeenCalledWith("client-1", {});
  });

  it("returns 200 with display settings on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const display = { showPrice: true, showDuration: false };
    vi.mocked(setServiceDisplay).mockResolvedValue(display as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ showPrice: true }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ display });
    expect(setServiceDisplay).toHaveBeenCalledWith("t-99", { showPrice: true });
  });
});
