import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";
import { repPerformance, discountImpact } from "./analytics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("repPerformance", () => {
  it("rolls up funnel, revenue, and commission per rep", async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      { id: "rep1", user: { name: "Jane" }, _count: { salesAssignments: 4 } },
    ]);
    prismaMock.quote.findMany.mockResolvedValue([
      { salesRepId: "rep1", status: "CONVERTED" },
      { salesRepId: "rep1", status: "SENT" },
      { salesRepId: "rep1", status: "DRAFT" },
    ]);
    prismaMock.client.findMany.mockResolvedValue([
      { sourceQuote: { salesRepId: "rep1" }, subscription: { agreedSetupFee: 99900, agreedMonthlyFee: 15000 } },
    ]);
    prismaMock.commissionRecord.groupBy.mockResolvedValue([
      { employeeId: "rep1", status: "PAID", _sum: { amount: 110 } },
      { employeeId: "rep1", status: "ELIGIBLE", _sum: { amount: 60 } },
    ]);

    const [r] = await repPerformance();
    expect(r).toMatchObject({
      repId: "rep1",
      prospects: 4,
      quotes: 3,
      quotesSent: 2, // SENT + CONVERTED
      conversions: 1,
      conversionRate: 0.25, // 1/4
      setupRevenue: 999,
      monthlyRevenue: 150,
      commissionPaid: 110,
      commissionOutstanding: 60,
    });
  });
});

describe("discountImpact", () => {
  it("compares conversion of discounted vs full-price and totals discounts", async () => {
    prismaMock.quote.findMany.mockResolvedValue([
      // discounted, converted
      { status: "CONVERTED", listedSetupFee: 69900, offeredSetupFee: 59900, listedMonthlyFee: 8900, offeredMonthlyFee: 8900 },
      // discounted, not converted
      { status: "SENT", listedSetupFee: 69900, offeredSetupFee: 64900, listedMonthlyFee: 8900, offeredMonthlyFee: 8900 },
      // full price, converted
      { status: "CONVERTED", listedSetupFee: 39900, offeredSetupFee: 39900, listedMonthlyFee: 3900, offeredMonthlyFee: 3900 },
    ]);

    const d = await discountImpact();
    expect(d.discounted).toEqual({ quotes: 2, conversions: 1, conversionRate: 0.5 });
    expect(d.fullPrice).toEqual({ quotes: 1, conversions: 1, conversionRate: 1 });
    expect(d.totalSetupDiscount).toBe(150); // ($100 + $50)
    expect(d.avgSetupDiscount).toBe(75);
  });
});
