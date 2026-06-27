import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/payments", () => ({ chargeInvoiceOffSession: vi.fn() }));
// createDocument and sendDocument are from the same module — we mock at the service module level
vi.mock("./service", () => ({
  createDocument: vi.fn(),
  sendDocument: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
  getFinanceSettings: vi.fn(),
}));

import {
  listRecurringPlans,
  createRecurringPlan,
  updateRecurringPlan,
  deleteRecurringPlan,
  sweepRecurringPlans,
  intervalLabel,
} from "./recurring";
import { writeAudit } from "@/lib/modules/audit";
import { chargeInvoiceOffSession } from "@/lib/modules/payments";
import { createDocument, sendDocument } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

const makePlanRow = (overrides: Record<string, unknown> = {}) => ({
  id: "rp1",
  clientId: "c1",
  customerId: "cu1",
  title: "Monthly mowing",
  mode: "INVOICE",
  interval: "MONTHLY",
  status: "ACTIVE",
  lineItems: [{ description: "Lawn mow", quantity: 1, unitAmount: 5000, serviceId: null, taxRateId: null }],
  currency: "usd",
  notes: null,
  dueDays: 14,
  nextRunAt: new Date("2025-01-01T00:00:00Z"),
  lastRunAt: null,
  occurrences: 0,
  stripeCustomerId: null,
  stripePaymentMethodId: null,
  createdAt: new Date("2024-12-01T00:00:00Z"),
  customer: { name: "Alice" },
  ...overrides,
});

describe("intervalLabel", () => {
  it("returns human-readable labels for all intervals", () => {
    expect(intervalLabel("WEEKLY")).toBe("Weekly");
    expect(intervalLabel("BIWEEKLY")).toBe("Every 2 weeks");
    expect(intervalLabel("MONTHLY")).toBe("Monthly");
    expect(intervalLabel("QUARTERLY")).toBe("Every 3 months");
    expect(intervalLabel("YEARLY")).toBe("Yearly");
  });
});

describe("listRecurringPlans", () => {
  it("returns plans scoped to clientId", async () => {
    prismaMock.recurringPlan.findMany.mockResolvedValue([makePlanRow()] as never);
    const result = await listRecurringPlans("c1");
    expect(prismaMock.recurringPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("rp1");
  });

  it("computes amountPerCycle as integer cents (quantity × unitAmount)", async () => {
    prismaMock.recurringPlan.findMany.mockResolvedValue([
      makePlanRow({ lineItems: [{ description: "Item A", quantity: 2, unitAmount: 2500, serviceId: null, taxRateId: null }] }),
    ] as never);
    const [plan] = await listRecurringPlans("c1");
    expect(plan.amountPerCycle).toBe(5000);
    expect(Number.isInteger(plan.amountPerCycle)).toBe(true);
  });

  it("sets hasCardOnFile only when both stripeCustomerId and stripePaymentMethodId are present", async () => {
    prismaMock.recurringPlan.findMany.mockResolvedValue([
      makePlanRow({ stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_y" }),
    ] as never);
    const [plan] = await listRecurringPlans("c1");
    expect(plan.hasCardOnFile).toBe(true);
  });

  it("hasCardOnFile is false when only one field is set", async () => {
    prismaMock.recurringPlan.findMany.mockResolvedValue([
      makePlanRow({ stripeCustomerId: "cus_x", stripePaymentMethodId: null }),
    ] as never);
    const [plan] = await listRecurringPlans("c1");
    expect(plan.hasCardOnFile).toBe(false);
  });
});

describe("createRecurringPlan", () => {
  const validInput = {
    customerId: "cu1",
    title: "Monthly mowing",
    mode: "INVOICE",
    interval: "MONTHLY",
    lineItems: [{ description: "Lawn mow", quantity: 1, unitAmount: 5000 }],
    currency: "usd",
    dueDays: 14,
  };

  it("throws customer_not_found when customer does not belong to the tenant (IDOR guard)", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    await expect(createRecurringPlan("c1", validInput)).rejects.toThrow("customer_not_found");
    expect(prismaMock.recurringPlan.create).not.toHaveBeenCalled();
  });

  it("creates the plan and audits on success", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cu1" } as never);
    prismaMock.recurringPlan.create.mockResolvedValue(makePlanRow() as never);
    const result = await createRecurringPlan("c1", validInput);
    expect(result.id).toBe("rp1");
    expect(prismaMock.recurringPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", customerId: "cu1", title: "Monthly mowing" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.recurring_created", entityId: "rp1" }));
  });

  it("uses startDate as the initial nextRunAt when provided", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cu1" } as never);
    prismaMock.recurringPlan.create.mockResolvedValue(makePlanRow() as never);
    await createRecurringPlan("c1", { ...validInput, startDate: "2026-03-15" });
    expect(prismaMock.recurringPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextRunAt: new Date("2026-03-15") }),
      }),
    );
  });
});

describe("updateRecurringPlan", () => {
  it("throws not_found when the plan is not owned by the tenant (IDOR guard)", async () => {
    prismaMock.recurringPlan.findFirst.mockResolvedValue(null);
    await expect(updateRecurringPlan("c1", "rp9", { title: "New title" })).rejects.toThrow("not_found");
    expect(prismaMock.recurringPlan.update).not.toHaveBeenCalled();
  });

  it("updates the plan and audits on success", async () => {
    prismaMock.recurringPlan.findFirst.mockResolvedValue({ id: "rp1" } as never);
    prismaMock.recurringPlan.update.mockResolvedValue(makePlanRow({ title: "New title" }) as never);
    const result = await updateRecurringPlan("c1", "rp1", { title: "New title" });
    expect(result.title).toBe("New title");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.recurring_updated", entityId: "rp1" }));
  });

  it("can pause/end a plan via status field", async () => {
    prismaMock.recurringPlan.findFirst.mockResolvedValue({ id: "rp1" } as never);
    prismaMock.recurringPlan.update.mockResolvedValue(makePlanRow({ status: "PAUSED" }) as never);
    const result = await updateRecurringPlan("c1", "rp1", { status: "PAUSED" });
    expect(result.status).toBe("PAUSED");
    expect(prismaMock.recurringPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAUSED" }) }),
    );
  });
});

describe("deleteRecurringPlan", () => {
  it("throws not_found when the plan is not owned by the tenant (IDOR guard)", async () => {
    prismaMock.recurringPlan.findFirst.mockResolvedValue(null);
    await expect(deleteRecurringPlan("c1", "rp9")).rejects.toThrow("not_found");
    expect(prismaMock.recurringPlan.delete).not.toHaveBeenCalled();
  });

  it("deletes the plan and audits", async () => {
    prismaMock.recurringPlan.findFirst.mockResolvedValue({ id: "rp1" } as never);
    prismaMock.recurringPlan.delete.mockResolvedValue({} as never);
    const result = await deleteRecurringPlan("c1", "rp1");
    expect(result).toEqual({ id: "rp1" });
    expect(prismaMock.recurringPlan.delete).toHaveBeenCalledWith({ where: { id: "rp1" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.recurring_deleted" }));
  });
});

describe("sweepRecurringPlans", () => {
  it("returns zero counts when no plans are due", async () => {
    prismaMock.recurringPlan.findMany.mockResolvedValue([]);
    const result = await sweepRecurringPlans();
    expect(result).toEqual({ generated: 0, charged: 0 });
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("generates an invoice and advances the schedule for each due plan", async () => {
    const planRow = makePlanRow();
    prismaMock.recurringPlan.findMany.mockResolvedValue([planRow] as never);
    vi.mocked(createDocument).mockResolvedValue({ id: "inv1" } as never);
    vi.mocked(sendDocument).mockResolvedValue({} as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    prismaMock.recurringPlan.update.mockResolvedValue({} as never);

    const result = await sweepRecurringPlans();
    expect(result.generated).toBe(1);
    expect(result.charged).toBe(0); // INVOICE mode, no auto-charge
    expect(createDocument).toHaveBeenCalledWith("c1", expect.objectContaining({ docType: "INVOICE" }));
    expect(sendDocument).toHaveBeenCalledWith("c1", "inv1");
    // Schedule was advanced
    expect(prismaMock.recurringPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rp1" }, data: expect.objectContaining({ occurrences: { increment: 1 } }) }),
    );
  });

  it("attempts an off-session charge for AUTO_CHARGE plans with a saved card", async () => {
    const planRow = makePlanRow({
      mode: "AUTO_CHARGE",
      stripeCustomerId: "cus_x",
      stripePaymentMethodId: "pm_y",
    });
    prismaMock.recurringPlan.findMany.mockResolvedValue([planRow] as never);
    vi.mocked(createDocument).mockResolvedValue({ id: "inv2" } as never);
    vi.mocked(sendDocument).mockResolvedValue({} as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    prismaMock.recurringPlan.update.mockResolvedValue({} as never);
    vi.mocked(chargeInvoiceOffSession).mockResolvedValue({ charged: true } as never);

    const result = await sweepRecurringPlans();
    expect(result.generated).toBe(1);
    expect(result.charged).toBe(1);
    expect(chargeInvoiceOffSession).toHaveBeenCalledWith("inv2", { stripeCustomerId: "cus_x", paymentMethodId: "pm_y" });
  });

  it("skips a plan with no line items without crashing", async () => {
    const planRow = makePlanRow({ lineItems: [] });
    prismaMock.recurringPlan.findMany.mockResolvedValue([planRow] as never);
    const result = await sweepRecurringPlans();
    expect(result.generated).toBe(0);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("handles a failing plan gracefully and pushes its next run out a day", async () => {
    const planRow = makePlanRow();
    prismaMock.recurringPlan.findMany.mockResolvedValue([planRow] as never);
    vi.mocked(createDocument).mockRejectedValue(new Error("db error"));
    prismaMock.recurringPlan.update.mockResolvedValue({} as never);

    const result = await sweepRecurringPlans();
    expect(result.generated).toBe(0);
    // The error-recovery update (push out a day) was called
    expect(prismaMock.recurringPlan.update).toHaveBeenCalled();
  });
});
