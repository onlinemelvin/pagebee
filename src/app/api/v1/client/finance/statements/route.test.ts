import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  listStatements: vi.fn(),
  generateStatement: vi.fn(),
  assertFinanceEnabled: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listStatements, generateStatement, assertFinanceEnabled, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/statements", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/statements"));
    expect(res.status).toBe(401);
    expect(listStatements).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/statements"));
    expect(res.status).toBe(403);
  });

  it("returns FinanceError status when finance not enabled", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockRejectedValue(new FinanceError(403, "finance_not_enabled"));
    const res = await GET(new Request("http://localhost/api/v1/client/finance/statements"));
    expect(res.status).toBe(403);
  });

  it("passes customerId query param to service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    vi.mocked(listStatements).mockResolvedValue([] as never);
    await GET(new Request("http://localhost/api/v1/client/finance/statements?customerId=cust-1"));
    expect(listStatements).toHaveBeenCalledWith("client-1", "cust-1");
  });

  it("passes undefined customerId when param absent", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    vi.mocked(listStatements).mockResolvedValue([] as never);
    await GET(new Request("http://localhost/api/v1/client/finance/statements"));
    expect(listStatements).toHaveBeenCalledWith("client-1", undefined);
  });

  it("returns 200 with statements on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const statements = [{ id: "stmt-1" }];
    vi.mocked(listStatements).mockResolvedValue(statements as never);
    const res = await GET(new Request("http://localhost/api/v1/client/finance/statements"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ statements });
  });
});

describe("POST /api/v1/client/finance/statements", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/statements", {
      method: "POST",
      body: JSON.stringify({ customerId: "cust-1", periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure — missing required fields", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/statements", {
      method: "POST",
      body: JSON.stringify({ customerId: "cust-1" }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 400 when periodEnd is before periodStart", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/statements", {
      method: "POST",
      body: JSON.stringify({ customerId: "cust-1", periodStart: "2026-06-01", periodEnd: "2026-01-01" }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_period" });
  });

  it("returns 201 with statement on success using clientId from guard", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    const statement = { id: "stmt-1" };
    vi.mocked(generateStatement).mockResolvedValue(statement as never);
    const res = await POST(new Request("http://localhost/api/v1/client/finance/statements", {
      method: "POST",
      body: JSON.stringify({ customerId: "cust-1", periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    }));
    expect(res.status).toBe(201);
    expect(generateStatement).toHaveBeenCalledWith("client-1", "cust-1", expect.any(Date), expect.any(Date));
    await expect(res.json()).resolves.toEqual({ statement });
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(assertFinanceEnabled).mockResolvedValue(undefined as never);
    vi.mocked(generateStatement).mockRejectedValue(new FinanceError(404, "customer_not_found"));
    const res = await POST(new Request("http://localhost/api/v1/client/finance/statements", {
      method: "POST",
      body: JSON.stringify({ customerId: "cust-x", periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    }));
    expect(res.status).toBe(404);
  });
});
