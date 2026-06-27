import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  listTaxRates: vi.fn(),
  createTaxRate: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listTaxRates, createTaxRate, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/tax-rates", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listTaxRates).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with tax rates on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const taxRates = [{ id: "tr-1", name: "CA Sales Tax", rate: 875 }];
    vi.mocked(listTaxRates).mockResolvedValue(taxRates as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listTaxRates).toHaveBeenCalledWith("client-1");
    await expect(res.json()).resolves.toEqual({ taxRates });
  });
});

describe("POST /api/v1/client/finance/tax-rates", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/tax-rates", {
      method: "POST",
      body: JSON.stringify({ name: "CA Sales Tax", rate: 875 }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(createTaxRate).mockRejectedValue(new ZodError([]));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/tax-rates", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(createTaxRate).mockRejectedValue(new FinanceError(409, "duplicate_name"));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/tax-rates", {
      method: "POST",
      body: JSON.stringify({ name: "CA Sales Tax", rate: 875 }),
    }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "duplicate_name" });
  });

  it("returns 201 with tax rate on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const taxRate = { id: "tr-1", name: "CA Sales Tax", rate: 875 };
    vi.mocked(createTaxRate).mockResolvedValue(taxRate as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/tax-rates", {
      method: "POST",
      body: JSON.stringify({ name: "CA Sales Tax", rate: 875 }),
    }));
    expect(res.status).toBe(201);
    expect(createTaxRate).toHaveBeenCalledWith("client-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ taxRate });
  });
});
