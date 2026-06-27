import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  updateTaxRate: vi.fn(),
  deleteTaxRate: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { updateTaxRate, deleteTaxRate, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };
const routeParams = { params: Promise.resolve({ id: "tr-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/finance/tax-rates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(401);
    expect(updateTaxRate).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const { ZodError } = await import("zod");
    vi.mocked(updateTaxRate).mockRejectedValue(new ZodError([]));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(updateTaxRate).mockRejectedValue(new FinanceError(404, "not_found"));
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "PATCH", body: JSON.stringify({}) }),
      routeParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated tax rate on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const taxRate = { id: "tr-1", name: "CA Sales Tax", rate: 900 };
    vi.mocked(updateTaxRate).mockResolvedValue(taxRate as never);
    const res = await PATCH(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "PATCH", body: JSON.stringify({ rate: 900 }) }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(updateTaxRate).toHaveBeenCalledWith("client-1", "tr-1", expect.any(Object));
    await expect(res.json()).resolves.toEqual({ taxRate });
  });
});

describe("DELETE /api/v1/client/finance/tax-rates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(401);
    expect(deleteTaxRate).not.toHaveBeenCalled();
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteTaxRate).mockRejectedValue(new FinanceError(409, "tax_rate_in_use"));
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "tax_rate_in_use" });
  });

  it("returns 200 ok on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(deleteTaxRate).mockResolvedValue(undefined as never);
    const res = await DELETE(
      new Request("http://localhost/api/v1/client/finance/tax-rates/tr-1", { method: "DELETE" }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(deleteTaxRate).toHaveBeenCalledWith("client-1", "tr-1");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
