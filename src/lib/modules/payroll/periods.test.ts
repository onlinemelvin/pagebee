import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import {
  createPayPeriod,
  generateDraftRecords,
  updatePayrollRecord,
  approvePayPeriod,
  markPayPeriodPaid,
} from "./periods";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("createPayPeriod", () => {
  it("rejects an end date before the start", async () => {
    await expect(
      createPayPeriod({ label: "Bad", startDate: "2026-07-15", endDate: "2026-07-01" }),
    ).rejects.toMatchObject({ code: "invalid_range" });
  });
});

describe("generateDraftRecords", () => {
  it("creates a record per active employee not already in the period, prefilling salary", async () => {
    prismaMock.payPeriod.findUnique.mockResolvedValue({ status: "DRAFT" });
    prismaMock.employee.findMany.mockResolvedValue([
      { id: "e1", compensationType: "SALARY", baseSalary: 4000 },
      { id: "e2", compensationType: "HOURLY", baseSalary: null },
      { id: "e3", compensationType: "SALARY", baseSalary: 5000 },
    ]);
    prismaMock.payrollRecord.findMany.mockResolvedValue([{ employeeId: "e3" }]); // e3 already present
    prismaMock.payrollRecord.create.mockResolvedValue({});

    const res = await generateDraftRecords("pp1");
    expect(res).toEqual({ created: 2, skipped: 1 });
    // salaried e1 prefilled with base as gross
    expect(prismaMock.payrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeId: "e1", grossSalary: 4000, netPay: 4000 }) }),
    );
    // hourly e2 starts at zero
    expect(prismaMock.payrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeId: "e2", grossSalary: 0 }) }),
    );
  });

  it("refuses to generate on a locked (non-draft) period", async () => {
    prismaMock.payPeriod.findUnique.mockResolvedValue({ status: "APPROVED" });
    await expect(generateDraftRecords("pp1")).rejects.toMatchObject({ code: "period_locked", status: 409 });
  });
});

describe("updatePayrollRecord", () => {
  it("recomputes hourly pay (rate × hours) and net", async () => {
    prismaMock.payrollRecord.findUnique.mockResolvedValue({
      grossSalary: 0, hoursWorked: 0, commissionPay: 0, bonus: 0, deductions: 0, reimbursements: 0,
      employee: { hourlyRate: 25 },
      payPeriod: { status: "DRAFT" },
    });
    prismaMock.payrollRecord.update.mockResolvedValue({ id: "r1", netPay: 980, hourlyPay: 1000 });

    await updatePayrollRecord("r1", { hoursWorked: 40, deductions: 20 });
    // hourlyPay = 25*40 = 1000; net = 0 + 1000 + 0 + 0 + 0 - 20 = 980
    expect(prismaMock.payrollRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hourlyPay: 1000, netPay: 980 }) }),
    );
  });

  it("refuses to edit a record in a non-draft period", async () => {
    prismaMock.payrollRecord.findUnique.mockResolvedValue({
      grossSalary: 0, hoursWorked: 0, commissionPay: 0, bonus: 0, deductions: 0, reimbursements: 0,
      employee: { hourlyRate: 25 }, payPeriod: { status: "APPROVED" },
    });
    await expect(updatePayrollRecord("r1", { bonus: 100 })).rejects.toMatchObject({ code: "period_locked" });
  });
});

describe("approve / pay lifecycle", () => {
  it("approves a draft period and its records", async () => {
    prismaMock.payPeriod.findUnique.mockResolvedValue({ status: "DRAFT" });
    prismaMock.payrollRecord.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.payPeriod.update.mockResolvedValue({});
    await expect(approvePayPeriod("pp1", { userId: "admin1" })).resolves.toEqual({ ok: true });
    expect(prismaMock.payrollRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedById: "admin1" }) }),
    );
  });

  it("won't approve a non-draft period", async () => {
    prismaMock.payPeriod.findUnique.mockResolvedValue({ status: "PAID" });
    await expect(approvePayPeriod("pp1", { userId: "admin1" })).rejects.toMatchObject({ code: "not_draft" });
  });

  it("pays only an approved period", async () => {
    prismaMock.payPeriod.findUnique.mockResolvedValue({ status: "DRAFT" });
    await expect(markPayPeriodPaid("pp1", { userId: "admin1" })).rejects.toMatchObject({ code: "not_approved" });
  });
});
