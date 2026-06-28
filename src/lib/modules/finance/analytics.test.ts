import { describe, it, expect } from "vitest";
import { prismaMock } from "@/test/setup";
import { getFinanceAnalytics } from "./analytics";

// analytics.ts only uses prisma — no other side-effect modules to mock.

describe("getFinanceAnalytics", () => {
  it("returns 12 monthly buckets even with no invoices", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    const result = await getFinanceAnalytics("c1");
    expect(result.revenueByMonth).toHaveLength(12);
    expect(result.collected12mo).toBe(0);
    expect(result.topCustomers).toHaveLength(0);
    expect(result.topItems).toHaveLength(0);
    expect(result.quote.sent).toBe(0);
    expect(result.quote.acceptanceRate).toBe(0);
  });

  it("scopes the query by clientId and kind", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    await getFinanceAnalytics("tenant-x");
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "tenant-x", kind: "CLIENT_CUSTOMER" } }),
    );
  });

  it("accumulates collected revenue for paid invoices — money is integer cents", async () => {
    const paidAt = new Date(); // within the last 12 months
    prismaMock.invoice.findMany.mockResolvedValue([
      {
        docType: "INVOICE",
        status: "PAID",
        total: 10000,
        amountPaid: 10000,
        issueDate: paidAt,
        createdAt: paidAt,
        paidAt,
        customer: { name: "Alice" },
        lineItems: [{ description: "Lawn care", amount: 10000 }],
      },
      {
        docType: "INVOICE",
        status: "PAID",
        total: 5000,
        amountPaid: 5000,
        issueDate: paidAt,
        createdAt: paidAt,
        paidAt,
        customer: { name: "Alice" },
        lineItems: [{ description: "Lawn care", amount: 5000 }],
      },
    ] as never);

    const result = await getFinanceAnalytics("c1");
    // Integer cents — never fractional
    expect(Number.isInteger(result.collected12mo)).toBe(true);
    expect(result.collected12mo).toBe(15000);
    expect(result.topCustomers[0]).toEqual({ name: "Alice", total: 15000 });
  });

  it("rolls invoice revenue into the correct month bucket", async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    prismaMock.invoice.findMany.mockResolvedValue([
      {
        docType: "INVOICE",
        status: "PAID",
        total: 3000,
        amountPaid: 3000,
        issueDate: thisMonth,
        createdAt: thisMonth,
        paidAt: thisMonth,
        customer: { name: "Bob" },
        lineItems: [],
      },
    ] as never);

    const result = await getFinanceAnalytics("c1");
    const lastBucket = result.revenueByMonth[11]; // newest month
    expect(lastBucket.collected).toBe(3000);
    // invoiced bucket also ticked
    expect(lastBucket.invoiced).toBe(3000);
  });

  it("counts quote/estimate acceptance correctly", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      { docType: "QUOTE", status: "ACCEPTED", total: 0, amountPaid: 0, issueDate: null, createdAt: new Date(), paidAt: null, customer: null, lineItems: [] },
      { docType: "QUOTE", status: "DECLINED", total: 0, amountPaid: 0, issueDate: null, createdAt: new Date(), paidAt: null, customer: null, lineItems: [] },
      { docType: "ESTIMATE", status: "SENT", total: 0, amountPaid: 0, issueDate: null, createdAt: new Date(), paidAt: null, customer: null, lineItems: [] },
      { docType: "ESTIMATE", status: "DRAFT", total: 0, amountPaid: 0, issueDate: null, createdAt: new Date(), paidAt: null, customer: null, lineItems: [] }, // DRAFT not counted as "sent"
    ] as never);

    const result = await getFinanceAnalytics("c1");
    expect(result.quote.sent).toBe(3); // ACCEPTED + DECLINED + SENT
    expect(result.quote.accepted).toBe(1);
    expect(result.quote.declined).toBe(1);
    expect(result.quote.pending).toBe(1); // SENT
    expect(result.quote.acceptanceRate).toBe(33); // Math.round(1/3*100)
  });

  it("ignores paid invoices outside the 12-month window", async () => {
    const old = new Date(Date.UTC(2000, 0, 1)); // far in the past
    prismaMock.invoice.findMany.mockResolvedValue([
      {
        docType: "INVOICE",
        status: "PAID",
        total: 50000,
        amountPaid: 50000,
        issueDate: old,
        createdAt: old,
        paidAt: old,
        customer: { name: "Ghost" },
        lineItems: [],
      },
    ] as never);

    const result = await getFinanceAnalytics("c1");
    expect(result.collected12mo).toBe(0);
    expect(result.topCustomers).toHaveLength(0);
  });

  it("returns top 5 customers sorted by total desc", async () => {
    const paidAt = new Date();
    const makeInv = (name: string, amount: number) => ({
      docType: "INVOICE",
      status: "PAID",
      total: amount,
      amountPaid: amount,
      issueDate: paidAt,
      createdAt: paidAt,
      paidAt,
      customer: { name },
      lineItems: [],
    });
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInv("A", 600), makeInv("B", 500), makeInv("C", 400),
      makeInv("D", 300), makeInv("E", 200), makeInv("F", 100),
    ] as never);

    const result = await getFinanceAnalytics("c1");
    expect(result.topCustomers).toHaveLength(5);
    expect(result.topCustomers[0].name).toBe("A");
    expect(result.topCustomers[4].name).toBe("E");
  });
});
