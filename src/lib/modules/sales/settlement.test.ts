import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { listSettlementQueue, approveCommission, markCommissionsPaid, repCommissionStatement } from "./settlement";
import { SalesError } from "./errors";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("listSettlementQueue", () => {
  it("groups eligible + approved records by rep with per-rep totals", async () => {
    prismaMock.commissionRecord.findMany.mockResolvedValue([
      { id: "r1", employeeId: "rep1", status: "ELIGIBLE", basis: "setup_fee", amount: 110, collectedRevenue: 699, eligibleAt: new Date(), createdAt: new Date(), employee: { id: "rep1", user: { name: "Jane" } }, client: { businessName: "Acme" } },
      { id: "r2", employeeId: "rep1", status: "APPROVED", basis: "setup_fee", amount: 60, collectedRevenue: 399, eligibleAt: new Date(), createdAt: new Date(), employee: { id: "rep1", user: { name: "Jane" } }, client: { businessName: "Beta" } },
    ]);
    const queue = await listSettlementQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ repId: "rep1", repName: "Jane", eligibleTotal: 110, approvedTotal: 60 });
    expect(queue[0].records).toHaveLength(2);
  });
});

describe("approveCommission", () => {
  it("moves ELIGIBLE → APPROVED with approver + timestamp", async () => {
    prismaMock.commissionRecord.findUnique.mockResolvedValue({ status: "ELIGIBLE" });
    prismaMock.commissionRecord.update.mockResolvedValue({ id: "r1", status: "APPROVED" });
    await approveCommission("r1", { userId: "admin1" });
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "APPROVED", approvedById: "admin1", approvedAt: expect.any(Date) },
    });
  });

  it("409 when the record isn't eligible", async () => {
    prismaMock.commissionRecord.findUnique.mockResolvedValue({ status: "PAID" });
    await expect(approveCommission("r1", { userId: "admin1" })).rejects.toMatchObject({ code: "not_eligible", status: 409 });
  });

  it("404 when the record is missing", async () => {
    prismaMock.commissionRecord.findUnique.mockResolvedValue(null);
    await expect(approveCommission("r1", { userId: "admin1" })).rejects.toMatchObject({ code: "commission_not_found" });
  });
});

describe("markCommissionsPaid", () => {
  it("marks approved records paid and appends the payout reference", async () => {
    prismaMock.commissionRecord.findMany.mockResolvedValue([
      { id: "r1", notes: null },
      { id: "r2", notes: "existing" },
    ]);
    prismaMock.commissionRecord.update.mockResolvedValue({});
    const res = await markCommissionsPaid(["r1", "r2"], "Upwork #42", { userId: "admin1" });
    expect(res).toEqual({ paid: 2 });
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "PAID", paidAt: expect.any(Date), notes: "Paid: Upwork #42" },
    });
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledWith({
      where: { id: "r2" },
      data: { status: "PAID", paidAt: expect.any(Date), notes: "existing\nPaid: Upwork #42" },
    });
  });

  it("requires a payout reference", async () => {
    await expect(markCommissionsPaid(["r1"], "  ", { userId: "admin1" })).rejects.toMatchObject({ code: "payout_reference_required" });
  });

  it("409 when none of the ids are approved", async () => {
    prismaMock.commissionRecord.findMany.mockResolvedValue([]);
    await expect(markCommissionsPaid(["r1"], "ref", { userId: "admin1" })).rejects.toMatchObject({ code: "no_approved_records" });
  });
});

describe("repCommissionStatement", () => {
  it("totals amounts by status", async () => {
    prismaMock.commissionRecord.findMany.mockResolvedValue([
      { id: "r1", status: "PAID", basis: "setup_fee", amount: 110, collectedRevenue: 699, eligibleAt: new Date(), createdAt: new Date(), client: { businessName: "Acme" } },
      { id: "r2", status: "ELIGIBLE", basis: "setup_fee", amount: 60, collectedRevenue: 399, eligibleAt: new Date(), createdAt: new Date(), client: { businessName: "Beta" } },
    ]);
    const { totals, records } = await repCommissionStatement("rep1");
    expect(totals.paid).toBe(110);
    expect(totals.eligible).toBe(60);
    expect(records).toHaveLength(2);
  });
});
