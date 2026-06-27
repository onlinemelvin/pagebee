import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  getTaxReport: vi.fn(),
  getIncomeReport: vi.fn(),
  get1099Summary: vi.fn(),
}));

import { GET } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getTaxReport, getIncomeReport, get1099Summary } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

function makeReq(type: string, qs = "") {
  return new Request(`http://localhost/api/v1/client/finance/reports/${type}${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/finance/reports/[type]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(makeReq("tax"), { params: Promise.resolve({ type: "tax" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(makeReq("tax"), { params: Promise.resolve({ type: "tax" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown report type", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const res = await GET(makeReq("profit"), { params: Promise.resolve({ type: "profit" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "unknown_report" });
  });

  it("returns tax CSV for type=tax", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(getTaxReport).mockResolvedValue({
      rows: [{ state: "CA", salesBase: 10000, taxCollected: 875, invoiceCount: 3 }],
      totalSales: 10000,
      totalTax: 875,
    } as never);
    const res = await GET(makeReq("tax"), { params: Promise.resolve({ type: "tax" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("sales-tax_");
    expect(getTaxReport).toHaveBeenCalledWith("client-1", expect.any(Date), expect.any(Date));
    const text = await res.text();
    expect(text).toContain("CA");
  });

  it("returns income CSV for type=income", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(getIncomeReport).mockResolvedValue({
      rows: [{ number: "INV-001", customer: "Alice", paidAt: "2026-01-15", total: 20000, amountPaid: 20000 }],
      totalCollected: 20000,
    } as never);
    const res = await GET(makeReq("income"), { params: Promise.resolve({ type: "income" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("income_");
    const text = await res.text();
    expect(text).toContain("INV-001");
  });

  it("returns 1099 CSV for type=1099", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(get1099Summary).mockResolvedValue({
      monthly: [{ month: 1, amount: 50000 }],
      gross: 50000,
      count: 12,
    } as never);
    const res = await GET(makeReq("1099", "?year=2025"), { params: Promise.resolve({ type: "1099" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("1099k-summary_2025");
    expect(get1099Summary).toHaveBeenCalledWith("client-1", 2025);
    const text = await res.text();
    expect(text).toContain("January");
  });

  it("passes from/to date params to service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(getTaxReport).mockResolvedValue({ rows: [], totalSales: 0, totalTax: 0 } as never);
    await GET(makeReq("tax", "?from=2026-01-01&to=2026-06-30"), { params: Promise.resolve({ type: "tax" }) });
    const [, from, to] = vi.mocked(getTaxReport).mock.calls[0];
    expect(from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(to.toISOString().slice(0, 10)).toBe("2026-06-30");
  });
});
