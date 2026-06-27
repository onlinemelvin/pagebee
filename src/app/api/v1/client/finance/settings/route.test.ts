import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn(),
  saveFinanceSettings: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/settings", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getFinanceSettings).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with settings on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const settings = { currency: "USD", taxEnabled: false };
    vi.mocked(getFinanceSettings).mockResolvedValue(settings as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getFinanceSettings).toHaveBeenCalledWith("client-1");
    await expect(res.json()).resolves.toEqual({ settings });
  });
});

describe("PUT /api/v1/client/finance/settings", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await PUT(new Request("http://localhost/api/v1/client/finance/settings", {
      method: "PUT",
      body: JSON.stringify({ currency: "USD" }),
    }));
    expect(res.status).toBe(401);
    expect(saveFinanceSettings).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await PUT(new Request("http://localhost/api/v1/client/finance/settings", {
      method: "PUT",
      body: JSON.stringify({ currency: "USD" }),
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(saveFinanceSettings).mockRejectedValue(new ZodError([]));
    const res = await PUT(new Request("http://localhost/api/v1/client/finance/settings", {
      method: "PUT",
      body: JSON.stringify({ currency: "INVALID" }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 200 with saved settings on success using clientId from guard", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const settings = { currency: "USD", taxEnabled: true };
    vi.mocked(saveFinanceSettings).mockResolvedValue(settings as never);
    const res = await PUT(new Request("http://localhost/api/v1/client/finance/settings", {
      method: "PUT",
      body: JSON.stringify({ currency: "USD", taxEnabled: true }),
    }));
    expect(res.status).toBe(200);
    expect(saveFinanceSettings).toHaveBeenCalledWith("client-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ settings });
  });
});
