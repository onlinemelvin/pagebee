import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  listRecurringPlans: vi.fn(),
  createRecurringPlan: vi.fn(),
  assertFinanceEnabled: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listRecurringPlans, createRecurringPlan, assertFinanceEnabled, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/recurring", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listRecurringPlans).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns FinanceError status when finance not enabled", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockRejectedValue(new FinanceError(403, "finance_not_enabled"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with plans on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const plans = [{ id: "plan-1" }];
    vi.mocked(listRecurringPlans).mockResolvedValue(plans as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listRecurringPlans).toHaveBeenCalledWith("client-1");
    await expect(res.json()).resolves.toEqual({ plans });
  });
});

describe("POST /api/v1/client/finance/recurring", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/recurring", {
      method: "POST",
      body: JSON.stringify({ name: "Monthly" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const { ZodError } = await import("zod");
    vi.mocked(createRecurringPlan).mockRejectedValue(new ZodError([]));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/recurring", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    vi.mocked(createRecurringPlan).mockRejectedValue(new FinanceError(409, "plan_exists"));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/recurring", {
      method: "POST",
      body: JSON.stringify({ name: "Monthly" }),
    }));
    expect(res.status).toBe(409);
  });

  it("returns 201 with plan on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const plan = { id: "plan-1" };
    vi.mocked(createRecurringPlan).mockResolvedValue(plan as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/recurring", {
      method: "POST",
      body: JSON.stringify({ name: "Monthly" }),
    }));
    expect(res.status).toBe(201);
    expect(createRecurringPlan).toHaveBeenCalledWith("client-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ plan });
  });
});
