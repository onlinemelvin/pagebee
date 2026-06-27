import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/booking", () => ({
  getSchedulingSettings: vi.fn(),
  saveSchedulingSettings: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getSchedulingSettings, saveSchedulingSettings } from "@/lib/modules/booking";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const validSettings = {
  timezone: "America/New_York",
  slotDuration: 30,
  bufferMinutes: 10,
  availability: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/scheduling", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getSchedulingSettings).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking appointments:view", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with settings, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(getSchedulingSettings).mockResolvedValue(validSettings as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ settings: validSettings });
    expect(getSchedulingSettings).toHaveBeenCalledWith("t-99");
  });
});

describe("PUT /api/v1/client/scheduling", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PUT(
      new Request("http://localhost/", { method: "PUT", body: JSON.stringify(validSettings) }),
    );
    expect(res.status).toBe(401);
    expect(saveSchedulingSettings).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking appointments:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PUT(
      new Request("http://localhost/", { method: "PUT", body: JSON.stringify(validSettings) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service (invalid settings)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const { ZodError, z } = await import("zod");
    const result = z.object({ timezone: z.string().min(1) }).safeParse({ timezone: "" });
    vi.mocked(saveSchedulingSettings).mockRejectedValue(
      new ZodError((result as unknown as { error: { issues: [] } }).error.issues),
    );

    const res = await PUT(
      new Request("http://localhost/", { method: "PUT", body: JSON.stringify({ timezone: "" }) }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 200 with settings on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(saveSchedulingSettings).mockResolvedValue(validSettings as never);

    const res = await PUT(
      new Request("http://localhost/", { method: "PUT", body: JSON.stringify(validSettings) }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ settings: validSettings });
    expect(saveSchedulingSettings).toHaveBeenCalledWith("t-99", expect.anything());
  });
});
