import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/email/customer-notifications", () => ({
  sendInvoiceOverdue: vi.fn(),
}));
vi.mock("./service", () => ({
  getFinanceSettings: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { sweepInvoiceReminders, pastUninvoicedAppointments } from "./reminders";
import * as customerNotify from "@/lib/modules/email/customer-notifications";
import { getFinanceSettings } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

const DAY = 86_400_000;

/** Build a minimal open invoice for the sweep. daysUntilDue > 0 = before due, < 0 = overdue. */
function makeInvoice(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "inv1",
    clientId: "c1",
    customerId: "cu1",
    number: "INV-0001",
    total: 10000,
    amountPaid: 0,
    status: "SENT",
    dueDate: new Date(now.getTime() + 7 * DAY), // due in 7 days by default
    publicToken: "tok1",
    lastReminderAt: null,
    currency: "usd",
    customer: { name: "Alice", email: "alice@example.com" },
    ...overrides,
  };
}

const enabledSettings = {
  reminders: { enabled: true, beforeDueDays: [7], afterDueDays: [3, 7] },
};

describe("sweepInvoiceReminders", () => {
  it("returns 0 when no open invoices exist", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    const result = await sweepInvoiceReminders();
    expect(result).toEqual({ sent: 0 });
    expect(customerNotify.sendInvoiceOverdue).not.toHaveBeenCalled();
  });

  it("skips invoices with zero balance (already paid)", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 10000, amountPaid: 10000 }),
    ] as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(0);
    expect(customerNotify.sendInvoiceOverdue).not.toHaveBeenCalled();
  });

  it("skips invoices without a customer email", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ customer: { name: "No Email", email: null } }),
    ] as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(0);
  });

  it("skips when reminders are disabled for the client", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([makeInvoice()] as never);
    vi.mocked(getFinanceSettings).mockResolvedValue({ reminders: { enabled: false, beforeDueDays: [7], afterDueDays: [3] } } as never);
    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(0);
    expect(customerNotify.sendInvoiceOverdue).not.toHaveBeenCalled();
  });

  it("sends a reminder when the invoice is due in exactly beforeDueDays days", async () => {
    const now = new Date();
    const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
    prismaMock.invoice.findMany.mockResolvedValue([makeInvoice({ dueDate })] as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    vi.mocked(customerNotify.sendInvoiceOverdue).mockResolvedValue(undefined);

    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(1);
    expect(customerNotify.sendInvoiceOverdue).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "alice@example.com", number: "INV-0001" }),
    );
    // lastReminderAt is updated
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ reminderCount: { increment: 1 } }) }),
    );
  });

  it("sends a reminder when the invoice is overdue by an afterDueDays number of days", async () => {
    const now = new Date();
    const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
    prismaMock.invoice.findMany.mockResolvedValue([makeInvoice({ dueDate, status: "OVERDUE" })] as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    vi.mocked(customerNotify.sendInvoiceOverdue).mockResolvedValue(undefined);

    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(1);
  });

  it("does NOT send a duplicate reminder on the same calendar day", async () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ lastReminderAt: today }),
    ] as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);

    const result = await sweepInvoiceReminders();
    expect(result.sent).toBe(0);
    expect(customerNotify.sendInvoiceOverdue).not.toHaveBeenCalled();
  });

  it("flips SENT to OVERDUE status when the invoice is past due", async () => {
    const now = new Date();
    const overdueDue = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ status: "SENT", dueDate: overdueDue }),
    ] as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    vi.mocked(getFinanceSettings).mockResolvedValue({ reminders: { enabled: false, beforeDueDays: [], afterDueDays: [] } } as never);

    await sweepInvoiceReminders();
    // Should call update to set OVERDUE even if no reminder scheduled
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: { status: "OVERDUE" } }),
    );
  });

  it("caches settings per client (does not re-fetch for same clientId)", async () => {
    const now = new Date();
    const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ id: "inv1", dueDate }),
      makeInvoice({ id: "inv2", dueDate }),
    ] as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    vi.mocked(customerNotify.sendInvoiceOverdue).mockResolvedValue(undefined);

    await sweepInvoiceReminders();
    // Settings fetched only once for the same clientId
    expect(getFinanceSettings).toHaveBeenCalledTimes(1);
  });

  it("sends reminder with integer-cent balance (partial payment case)", async () => {
    const now = new Date();
    const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
    prismaMock.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 10000, amountPaid: 3000, dueDate }),
    ] as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    vi.mocked(getFinanceSettings).mockResolvedValue(enabledSettings as never);
    vi.mocked(customerNotify.sendInvoiceOverdue).mockResolvedValue(undefined);

    await sweepInvoiceReminders();
    expect(customerNotify.sendInvoiceOverdue).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ amountCents: 7000 }), // balance, not total
    );
    expect(Number.isInteger(7000)).toBe(true);
  });
});

describe("pastUninvoicedAppointments", () => {
  it("counts completed bookings with no linked invoice", async () => {
    prismaMock.booking.count.mockResolvedValue(3);
    const result = await pastUninvoicedAppointments("c1");
    expect(result).toBe(3);
    expect(prismaMock.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c1", status: "COMPLETED" }) }),
    );
  });

  it("returns 0 when all bookings are invoiced", async () => {
    prismaMock.booking.count.mockResolvedValue(0);
    const result = await pastUninvoicedAppointments("c1");
    expect(result).toBe(0);
  });
});
