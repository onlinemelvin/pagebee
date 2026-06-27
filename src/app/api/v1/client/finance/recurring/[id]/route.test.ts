import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  updateRecurringPlan: vi.fn(),
  deleteRecurringPlan: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { updateRecurringPlan, deleteRecurringPlan, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };
const routeParams = { params: Promise.resolve({ id: "plan-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/finance/recurring/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(401);
    expect(updateRecurringPlan).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(updateRecurringPlan).mockRejectedValue(new ZodError([]));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(updateRecurringPlan).mockRejectedValue(new FinanceError(404, "not_found"));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated plan on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const plan = { id: "plan-1", status: "PAUSED" };
    vi.mocked(updateRecurringPlan).mockResolvedValue(plan as never);
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "PATCH", body: JSON.stringify({ status: "PAUSED" }) }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(updateRecurringPlan).toHaveBeenCalledWith("client-1", "plan-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ plan });
  });
});

describe("DELETE /api/v1/client/finance/recurring/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(401);
    expect(deleteRecurringPlan).not.toHaveBeenCalled();
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteRecurringPlan).mockRejectedValue(new FinanceError(404, "not_found"));
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 ok on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteRecurringPlan).mockResolvedValue(undefined as never);
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/recurring/plan-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(deleteRecurringPlan).toHaveBeenCalledWith("client-1", "plan-1");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
