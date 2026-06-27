import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/email/customer-notifications", () => ({
  sendInvoiceSent: vi.fn(),
  sendEstimateSent: vi.fn(),
  sendInvoiceOverdue: vi.fn(),
}));
vi.mock("@/lib/modules/usage", () => ({
  requireWithinLimit: vi.fn(),
  UsageError: class UsageError extends Error { constructor(public code: string) { super(code); } },
}));
vi.mock("./pdf", () => ({
  renderDocumentPdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
  pdfFilename: vi.fn().mockReturnValue("invoice.pdf"),
}));
vi.mock("@/lib/modules/payments/tax", () => ({
  calculateTax: vi.fn(),
}));

import {
  assertFinanceEnabled,
  getFinanceSettings,
  saveFinanceSettings,
  listTaxRates,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  sendDocument,
  decideDocument,
  convertDocument,
  recordManualPayment,
  getPublicDocument,
  decideByToken,
  generateStatement,
  listStatements,
  getFinanceDashboard,
  getTaxReport,
  getIncomeReport,
  get1099Summary,
  FinanceError,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { requireWithinLimit } from "@/lib/modules/usage";
import * as customerNotify from "@/lib/modules/email/customer-notifications";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Client row that has invoices feature enabled */
const clientWithInvoices = {
  subscription: { plan: { featureFlags: { invoices: true } } },
};

/** Bare settings from the DB (none stored) */
const noSettings = null;

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    docType: "INVOICE",
    number: "INV-0001",
    status: "DRAFT",
    currency: "usd",
    clientId: "c1",
    customerId: "cu1",
    subtotal: 10000,
    discountType: null,
    discountValue: 0,
    discountTotal: 0,
    tax: 0,
    total: 10000,
    amountPaid: 0,
    depositAmount: 0,
    notes: null,
    terms: null,
    issueDate: new Date("2025-01-01"),
    dueDate: new Date("2025-01-15"),
    expiresAt: null,
    sentAt: null,
    acceptedAt: null,
    declinedAt: null,
    paidAt: null,
    convertedFromId: null,
    publicToken: null,
    bookingId: null,
    taxCalculationId: null,
    viewedAt: null,
    lastReminderAt: null,
    reminderCount: 0,
    recurringPlanId: null,
    kind: "CLIENT_CUSTOMER",
    createdAt: new Date("2025-01-01"),
    lineItems: [
      {
        id: "li1",
        serviceId: null,
        description: "Service A",
        quantity: 1,
        unitAmount: 10000,
        discountType: null,
        discountValue: 0,
        taxRateId: null,
        taxRateBps: 0,
        taxAmount: 0,
        amount: 10000,
        position: 0,
      },
    ],
    customer: { id: "cu1", name: "Alice", email: "alice@test.com", phone: null },
    convertedTo: null,
    client: { businessName: "Acme", paymentsEnabled: false },
    ...overrides,
  };
}

// ─── assertFinanceEnabled ────────────────────────────────────────────────────

describe("assertFinanceEnabled", () => {
  it("throws client_not_found when the client does not exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(assertFinanceEnabled("c1")).rejects.toThrow("client_not_found");
  });

  it("throws tier_required when neither invoices nor payments flag is set", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    await expect(assertFinanceEnabled("c1")).rejects.toThrow("tier_required");
  });

  it("passes when invoices flag is enabled", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    await expect(assertFinanceEnabled("c1")).resolves.toBeUndefined();
  });

  it("passes when payments flag is enabled (even if invoices is not)", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { payments: true } } },
    } as never);
    await expect(assertFinanceEnabled("c1")).resolves.toBeUndefined();
  });
});

// ─── getFinanceSettings ────────────────────────────────────────────────────

describe("getFinanceSettings", () => {
  it("returns defaults when no settings row exists", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    const s = await getFinanceSettings("c1");
    expect(s.currency).toBe("usd");
    expect(s.defaultDueDays).toBe(14);
    expect(s.reminders.enabled).toBe(false);
  });

  it("returns parsed settings when they exist", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      financeSettings: { currency: "gbp", defaultDueDays: 30 },
    } as never);
    const s = await getFinanceSettings("c1");
    expect(s.currency).toBe("gbp");
    expect(s.defaultDueDays).toBe(30);
  });

  it("falls back to defaults when stored settings fail to parse", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      financeSettings: { defaultDueDays: "not-a-number" }, // invalid
    } as never);
    const s = await getFinanceSettings("c1");
    // Should not throw, falls back to defaults
    expect(typeof s.defaultDueDays).toBe("number");
  });
});

// ─── saveFinanceSettings ───────────────────────────────────────────────────

describe("saveFinanceSettings", () => {
  it("upserts and audits when finance is enabled", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);
    await saveFinanceSettings("c1", { currency: "usd" });
    expect(prismaMock.clientSetting.upsert).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.settings_updated" }));
  });

  it("rejects when finance is not enabled on the plan", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: {} } } } as never);
    await expect(saveFinanceSettings("c1", {})).rejects.toThrow("tier_required");
  });
});

// ─── Tax rates ────────────────────────────────────────────────────────────────

describe("listTaxRates", () => {
  it("returns only active tax rates for the tenant", async () => {
    prismaMock.taxRate.findMany.mockResolvedValue([{ id: "tr1", name: "GST", rateBps: 1000, inclusive: false, isDefault: true, active: true }] as never);
    const rates = await listTaxRates("c1");
    expect(rates).toHaveLength(1);
    expect(prismaMock.taxRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", active: true } }),
    );
  });
});

describe("createTaxRate", () => {
  it("clears existing defaults when isDefault is true", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.taxRate.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.taxRate.create.mockResolvedValue({ id: "tr2", name: "VAT", rateBps: 2000, inclusive: false, isDefault: true, active: true } as never);

    await createTaxRate("c1", { name: "VAT", rateBps: 2000, inclusive: false, isDefault: true });
    expect(prismaMock.taxRate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", isDefault: true }, data: { isDefault: false } }),
    );
  });

  it("does NOT clear defaults when isDefault is false", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.taxRate.create.mockResolvedValue({ id: "tr3", name: "Local", rateBps: 500, inclusive: false, isDefault: false, active: true } as never);

    await createTaxRate("c1", { name: "Local", rateBps: 500, isDefault: false });
    expect(prismaMock.taxRate.updateMany).not.toHaveBeenCalled();
  });

  it("audits the creation", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.taxRate.create.mockResolvedValue({ id: "tr1", name: "GST", rateBps: 1000, inclusive: false, isDefault: false, active: true } as never);
    await createTaxRate("c1", { name: "GST", rateBps: 1000 });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.tax_rate_created" }));
  });
});

describe("updateTaxRate", () => {
  it("throws not_found for an unknown / cross-tenant rate", async () => {
    prismaMock.taxRate.findFirst.mockResolvedValue(null);
    await expect(updateTaxRate("c1", "tr9", { name: "X" })).rejects.toThrow("not_found");
    expect(prismaMock.taxRate.update).not.toHaveBeenCalled();
  });
});

describe("deleteTaxRate", () => {
  it("soft-deletes (sets active=false) instead of hard delete", async () => {
    prismaMock.taxRate.findFirst.mockResolvedValue({ id: "tr1" } as never);
    prismaMock.taxRate.update.mockResolvedValue({} as never);
    await deleteTaxRate("c1", "tr1");
    expect(prismaMock.taxRate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tr1" }, data: { active: false } }),
    );
    expect(prismaMock.taxRate.delete).not.toHaveBeenCalled();
  });

  it("throws not_found when the rate belongs to another tenant (IDOR guard)", async () => {
    prismaMock.taxRate.findFirst.mockResolvedValue(null);
    await expect(deleteTaxRate("c1", "tr9")).rejects.toThrow("not_found");
  });
});

// ─── createDocument ────────────────────────────────────────────────────────

describe("createDocument", () => {
  function setupForCreate() {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cu1", billingAddress: null } as never);
    prismaMock.invoice.count.mockResolvedValue(0);
    prismaMock.invoice.findFirst.mockResolvedValue(null); // no number collision
    prismaMock.taxRate.findMany.mockResolvedValue([]);
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);
    prismaMock.invoice.create.mockResolvedValue(makeInvoice() as never);
  }

  it("creates an INVOICE with the correct tenant, number prefix, and money in cents", async () => {
    setupForCreate();
    const result = await createDocument("c1", {
      docType: "INVOICE",
      customerId: "cu1",
      currency: "usd",
      lineItems: [{ description: "Service A", quantity: 1, unitAmount: 10000 }],
    });
    expect(result.id).toBe("inv1");
    expect(result.total).toBe(10000);
    // All monetary fields must be integers
    expect(Number.isInteger(result.total)).toBe(true);
    expect(Number.isInteger(result.subtotal)).toBe(true);
    expect(prismaMock.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", kind: "CLIENT_CUSTOMER", status: "DRAFT" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_created" }));
  });

  it("checks the invoice usage limit for INVOICE docType", async () => {
    setupForCreate();
    await createDocument("c1", {
      docType: "INVOICE",
      customerId: "cu1",
      currency: "usd",
      lineItems: [{ description: "Service A", quantity: 1, unitAmount: 5000 }],
    });
    expect(requireWithinLimit).toHaveBeenCalledWith("c1", "invoices");
  });

  it("does NOT check the invoice limit for ESTIMATE docType", async () => {
    setupForCreate();
    prismaMock.invoice.create.mockResolvedValue(makeInvoice({ docType: "ESTIMATE", number: "EST-0001" }) as never);
    await createDocument("c1", {
      docType: "ESTIMATE",
      customerId: "cu1",
      currency: "usd",
      lineItems: [{ description: "Estimate A", quantity: 1, unitAmount: 5000 }],
    });
    expect(requireWithinLimit).not.toHaveBeenCalled();
  });

  it("throws invoice_limit_reached when usage limit is exceeded", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cu1", billingAddress: null } as never);
    prismaMock.invoice.count.mockResolvedValue(0);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    prismaMock.taxRate.findMany.mockResolvedValue([]);
    const { UsageError } = await import("@/lib/modules/usage");
    vi.mocked(requireWithinLimit).mockRejectedValue(new UsageError(429, "limit_exceeded"));

    await expect(
      createDocument("c1", {
        docType: "INVOICE",
        customerId: "cu1",
        currency: "usd",
        lineItems: [{ description: "X", quantity: 1, unitAmount: 1000 }],
      }),
    ).rejects.toThrow("invoice_limit_reached");
  });

  it("rejects an unknown customer (IDOR guard)", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.customer.findFirst.mockResolvedValue(null); // not owned
    vi.mocked(requireWithinLimit).mockResolvedValue(undefined);

    await expect(
      createDocument("c1", {
        docType: "INVOICE",
        customerId: "cu9",
        currency: "usd",
        lineItems: [{ description: "X", quantity: 1, unitAmount: 1000 }],
      }),
    ).rejects.toThrow("invalid_customer");
  });
});

// ─── getDocument / listDocuments ───────────────────────────────────────────

describe("getDocument", () => {
  it("throws not_found when the document doesn't belong to the tenant", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(getDocument("c1", "inv9")).rejects.toThrow("not_found");
  });

  it("returns the DTO for a tenant-owned document", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(makeInvoice() as never);
    const doc = await getDocument("c1", "inv1");
    expect(doc.id).toBe("inv1");
    expect(doc.balanceDue).toBe(10000); // total - amountPaid
  });

  it("computes balanceDue as total minus amountPaid (integer cents)", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(makeInvoice({ total: 10000, amountPaid: 3000 }) as never);
    const doc = await getDocument("c1", "inv1");
    expect(doc.balanceDue).toBe(7000);
    expect(Number.isInteger(doc.balanceDue)).toBe(true);
  });
});

describe("listDocuments", () => {
  it("scopes by clientId and kind", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    await listDocuments("c1");
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c1", kind: "CLIENT_CUSTOMER" }) }),
    );
  });

  it("applies optional docType and status filters", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    await listDocuments("c1", { docType: "INVOICE", status: "PAID" as never });
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ docType: "INVOICE", status: "PAID" }) }),
    );
  });
});

// ─── deleteDocument ───────────────────────────────────────────────────────

describe("deleteDocument", () => {
  it("throws not_found when not owned by tenant", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(deleteDocument("c1", "inv9")).rejects.toThrow("not_found");
  });

  it("throws not_deletable when invoice is not in DRAFT status", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "SENT" } as never);
    await expect(deleteDocument("c1", "inv1")).rejects.toThrow("not_deletable");
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits a DRAFT document", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "DRAFT" } as never);
    prismaMock.invoice.delete.mockResolvedValue({} as never);
    const result = await deleteDocument("c1", "inv1");
    expect(result).toEqual({ id: "inv1" });
    expect(prismaMock.invoice.delete).toHaveBeenCalledWith({ where: { id: "inv1" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_deleted" }));
  });
});

// ─── sendDocument ─────────────────────────────────────────────────────────

describe("sendDocument", () => {
  it("throws not_found when the document doesn't belong to the tenant", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(sendDocument("c1", "inv9")).rejects.toThrow("not_found");
  });

  it("stamps SENT, mints a publicToken, and emails the customer", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    const inv = makeInvoice();
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    prismaMock.invoice.update.mockResolvedValue({ ...inv, status: "SENT", sentAt: new Date(), publicToken: "tok1" } as never);

    await sendDocument("c1", "inv1");
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
    );
    expect(customerNotify.sendInvoiceSent).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "alice@test.com" }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_sent" }));
  });

  it("reuses the existing publicToken (idempotent)", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    const inv = makeInvoice({ publicToken: "existing-token" });
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    prismaMock.invoice.update.mockResolvedValue({ ...inv, status: "SENT" } as never);

    await sendDocument("c1", "inv1");
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publicToken: "existing-token" }) }),
    );
  });

  it("sends estimate email for ESTIMATE docType", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    const inv = makeInvoice({ docType: "ESTIMATE", number: "EST-0001" });
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    prismaMock.invoice.update.mockResolvedValue({ ...inv, status: "SENT" } as never);

    await sendDocument("c1", "inv1");
    expect(customerNotify.sendEstimateSent).toHaveBeenCalled();
    expect(customerNotify.sendInvoiceSent).not.toHaveBeenCalled();
  });

  it("skips email entirely when the customer has no email address", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    const inv = makeInvoice({ customer: { id: "cu1", name: "No Email", email: null, phone: null } });
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    prismaMock.invoice.update.mockResolvedValue({ ...inv, status: "SENT" } as never);

    await sendDocument("c1", "inv1");
    expect(customerNotify.sendInvoiceSent).not.toHaveBeenCalled();
    expect(customerNotify.sendEstimateSent).not.toHaveBeenCalled();
  });
});

// ─── decideDocument ───────────────────────────────────────────────────────

describe("decideDocument", () => {
  it("throws not_found for unknown / cross-tenant document", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(decideDocument("c1", "inv9", "ACCEPTED")).rejects.toThrow("not_found");
  });

  it("throws not_a_quote when trying to decide an INVOICE", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "INVOICE" } as never);
    await expect(decideDocument("c1", "inv1", "ACCEPTED")).rejects.toThrow("not_a_quote");
  });

  it("stamps ACCEPTED with a timestamp and audits", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "ESTIMATE" } as never);
    prismaMock.invoice.update.mockResolvedValue(makeInvoice({ status: "ACCEPTED", docType: "ESTIMATE" }) as never);
    const result = await decideDocument("c1", "inv1", "ACCEPTED");
    expect(result.status).toBe("ACCEPTED");
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED", acceptedAt: expect.any(Date) }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_accepted" }));
  });

  it("stamps DECLINED and audits", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "QUOTE" } as never);
    prismaMock.invoice.update.mockResolvedValue(makeInvoice({ status: "DECLINED", docType: "QUOTE" }) as never);
    const result = await decideDocument("c1", "inv1", "DECLINED");
    expect(result.status).toBe("DECLINED");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_declined" }));
  });
});

// ─── convertDocument ──────────────────────────────────────────────────────

describe("convertDocument", () => {
  it("throws not_found when source document is not owned by tenant", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(convertDocument("c1", "inv9", "INVOICE")).rejects.toThrow("not_found");
  });

  it("throws already_converted when the source already has a convertedTo", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "ESTIMATE", convertedTo: { id: "inv2" }, lineItems: [] } as never);
    await expect(convertDocument("c1", "inv1", "INVOICE")).rejects.toThrow("already_converted");
  });

  it("throws invalid_conversion when converting to the same or lower type", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "INVOICE", convertedTo: null, lineItems: [] } as never);
    // INVOICE → ESTIMATE is invalid (going backwards)
    await expect(convertDocument("c1", "inv1", "ESTIMATE")).rejects.toThrow("invalid_conversion");
  });

  it("converts ESTIMATE → INVOICE via $transaction and audits", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(noSettings);
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: "inv1",
      docType: "ESTIMATE",
      convertedTo: null,
      lineItems: [],
      customerId: "cu1",
      currency: "usd",
      subtotal: 5000,
      discountType: null,
      discountValue: 0,
      discountTotal: 0,
      tax: 0,
      total: 5000,
      depositAmount: 0,
      notes: null,
      terms: null,
      acceptedAt: null,
    } as never);
    prismaMock.invoice.count.mockResolvedValue(0);
    prismaMock.invoice.findFirst
      .mockResolvedValueOnce({ id: "inv1", docType: "ESTIMATE", convertedTo: null, lineItems: [] } as never) // ownership check
      .mockResolvedValueOnce(null); // number collision check
    // $transaction invokes callback with prismaMock
    prismaMock.invoice.create.mockResolvedValue(makeInvoice({ docType: "INVOICE", number: "INV-0001" }) as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);

    const result = await convertDocument("c1", "inv1", "INVOICE");
    expect(result.docType).toBe("INVOICE");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.document_converted" }));
  });
});

// ─── recordManualPayment ─────────────────────────────────────────────────

describe("recordManualPayment", () => {
  it("throws not_found for unknown/cross-tenant invoice", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(recordManualPayment("c1", "inv9", { amount: 1000 })).rejects.toThrow("not_found");
  });

  it("throws not_an_invoice for estimates/quotes", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "ESTIMATE", total: 5000, amountPaid: 0 } as never);
    await expect(recordManualPayment("c1", "inv1", { amount: 1000 })).rejects.toThrow("not_an_invoice");
  });

  it("records a partial payment (PARTIALLY_PAID) — money is integer cents", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "INVOICE", total: 10000, amountPaid: 0 } as never);
    prismaMock.invoice.update.mockResolvedValue(makeInvoice({ amountPaid: 3000, status: "PARTIALLY_PAID" }) as never);
    const result = await recordManualPayment("c1", "inv1", { amount: 3000 });
    expect(result.amountPaid).toBe(3000);
    expect(Number.isInteger(result.amountPaid)).toBe(true);
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountPaid: 3000, status: "PARTIALLY_PAID" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.payment_recorded" }));
  });

  it("marks as PAID when the payment covers the full balance", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "INVOICE", total: 10000, amountPaid: 0 } as never);
    prismaMock.invoice.update.mockResolvedValue(makeInvoice({ amountPaid: 10000, status: "PAID" }) as never);
    await recordManualPayment("c1", "inv1", { amount: 10000 });
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }) }),
    );
  });

  it("caps amountPaid at total (no overpayment)", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithInvoices as never);
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", docType: "INVOICE", total: 10000, amountPaid: 9000 } as never);
    prismaMock.invoice.update.mockResolvedValue(makeInvoice({ amountPaid: 10000, status: "PAID" }) as never);
    await recordManualPayment("c1", "inv1", { amount: 5000 }); // would overpay
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountPaid: 10000 }) }), // capped at total
    );
  });
});

// ─── getPublicDocument ────────────────────────────────────────────────────

describe("getPublicDocument", () => {
  it("returns null for an unknown token", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    const result = await getPublicDocument("unknown-token");
    expect(result).toBeNull();
  });

  it("marks SENT → VIEWED on first visit", async () => {
    const inv = makeInvoice({ status: "SENT", publicToken: "tok1", viewedAt: null });
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);
    await getPublicDocument("tok1");
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "VIEWED" }) }),
    );
  });

  it("does NOT update status when already past SENT", async () => {
    const inv = makeInvoice({ status: "VIEWED", publicToken: "tok1", viewedAt: new Date() });
    prismaMock.invoice.findFirst.mockResolvedValue(inv as never);
    await getPublicDocument("tok1");
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });
});

// ─── decideByToken ────────────────────────────────────────────────────────

describe("decideByToken", () => {
  it("returns false for an unknown token", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    expect(await decideByToken("bad-token", "ACCEPTED")).toBe(false);
  });

  it("returns false for an INVOICE (can't accept invoices)", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({ id: "inv1", clientId: "c1", docType: "INVOICE" } as never);
    expect(await decideByToken("tok1", "ACCEPTED")).toBe(false);
  });
});

// ─── generateStatement ───────────────────────────────────────────────────

describe("generateStatement", () => {
  it("generates a statement with correct totals in integer cents", async () => {
    const invoices = [
      { id: "i1", number: "INV-0001", issueDate: new Date("2025-01-10"), dueDate: new Date("2025-01-24"), total: 10000, amountPaid: 5000, status: "PARTIALLY_PAID" },
      { id: "i2", number: "INV-0002", issueDate: new Date("2025-01-15"), dueDate: null, total: 3000, amountPaid: 3000, status: "PAID" },
    ];
    prismaMock.invoice.findMany.mockResolvedValue(invoices as never);
    prismaMock.statement.create.mockResolvedValue({ id: "stmt1" } as never);

    const result = await generateStatement("c1", "cu1", new Date("2025-01-01"), new Date("2025-01-31"));
    expect(result.billed).toBe(13000);
    expect(result.paid).toBe(8000);
    expect(result.balance).toBe(5000);
    expect(Number.isInteger(result.billed)).toBe(true);
    expect(Number.isInteger(result.balance)).toBe(true);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.statement_generated" }));
  });
});

// ─── getFinanceDashboard ─────────────────────────────────────────────────

describe("getFinanceDashboard", () => {
  it("correctly counts drafts, paid, outstanding, overdue — all amounts in cents", async () => {
    const now = new Date();
    const overdueDue = new Date(now.getTime() - 10 * 86_400_000); // 10 days ago
    const futureDue = new Date(now.getTime() + 10 * 86_400_000);
    prismaMock.invoice.findMany.mockResolvedValue([
      { status: "DRAFT", total: 5000, amountPaid: 0, dueDate: null, paidAt: null, issueDate: null },
      { status: "PAID", total: 10000, amountPaid: 10000, dueDate: null, paidAt: new Date(), issueDate: null },
      { status: "SENT", total: 8000, amountPaid: 0, dueDate: futureDue, paidAt: null, issueDate: null },
      { status: "OVERDUE", total: 6000, amountPaid: 0, dueDate: overdueDue, paidAt: null, issueDate: null },
    ] as never);
    prismaMock.invoice.count
      .mockResolvedValueOnce(1) // openEstimates
      .mockResolvedValueOnce(2); // openQuotes

    const dash = await getFinanceDashboard("c1");
    expect(dash.counts.drafts).toBe(1);
    expect(dash.counts.paid).toBe(1);
    expect(dash.counts.outstanding).toBe(2);
    expect(dash.counts.overdue).toBe(1);
    expect(dash.totalInvoiced).toBe(24000); // 10000 + 8000 + 6000
    expect(dash.outstanding).toBe(14000); // 8000 + 6000
    expect(Number.isInteger(dash.totalInvoiced)).toBe(true);
    expect(dash.counts.openEstimates).toBe(1);
    expect(dash.counts.openQuotes).toBe(2);
  });

  it("VOID invoices are excluded from all counts", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      { status: "VOID", total: 9999, amountPaid: 0, dueDate: null, paidAt: null, issueDate: null },
    ] as never);
    prismaMock.invoice.count.mockResolvedValue(0);
    const dash = await getFinanceDashboard("c1");
    expect(dash.totalInvoiced).toBe(0);
    expect(dash.outstanding).toBe(0);
  });
});

// ─── getTaxReport ─────────────────────────────────────────────────────────

describe("getTaxReport", () => {
  it("groups tax by state and totals in integer cents", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      { tax: 500, total: 5000, customer: { billingAddress: { state: "CA" } } },
      { tax: 200, total: 2000, customer: { billingAddress: { state: "CA" } } },
      { tax: 100, total: 1000, customer: { billingAddress: null } },
    ] as never);

    const report = await getTaxReport("c1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.totalTax).toBe(800);
    expect(Number.isInteger(report.totalTax)).toBe(true);
    const ca = report.rows.find((r) => r.state === "CA");
    expect(ca?.taxCollected).toBe(700);
    expect(ca?.invoiceCount).toBe(2);
    const unknown = report.rows.find((r) => r.state === "—");
    expect(unknown?.taxCollected).toBe(100);
  });

  it("scopes the query by clientId, PAID status, and date range", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    const from = new Date("2025-01-01");
    const to = new Date("2025-12-31");
    await getTaxReport("c1", from, to);
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "c1", status: "PAID", paidAt: { gte: from, lte: to } }),
      }),
    );
  });
});

// ─── getIncomeReport ──────────────────────────────────────────────────────

describe("getIncomeReport", () => {
  it("sums totalCollected in integer cents", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      { number: "INV-0001", total: 10000, amountPaid: 10000, paidAt: new Date(), customer: { name: "Alice" } },
      { number: "INV-0002", total: 5000, amountPaid: 5000, paidAt: new Date(), customer: { name: "Bob" } },
    ] as never);

    const report = await getIncomeReport("c1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.totalCollected).toBe(15000);
    expect(Number.isInteger(report.totalCollected)).toBe(true);
    expect(report.invoiceCount).toBe(2);
    expect(report.rows[0].customer).toBe("Alice");
  });

  it("returns empty report when no invoices match", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    const report = await getIncomeReport("c1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.totalCollected).toBe(0);
    expect(report.invoiceCount).toBe(0);
    expect(report.rows).toHaveLength(0);
  });
});

// ─── get1099Summary ───────────────────────────────────────────────────────

describe("get1099Summary", () => {
  it("sums gross card payments in integer cents by month", async () => {
    prismaMock.payment.findMany.mockResolvedValue([
      { amount: 10000, paidAt: new Date("2025-01-15") },
      { amount: 20000, paidAt: new Date("2025-01-20") },
      { amount: 5000, paidAt: new Date("2025-03-10") },
    ] as never);

    const summary = await get1099Summary("c1", 2025);
    expect(summary.gross).toBe(35000);
    expect(Number.isInteger(summary.gross)).toBe(true);
    expect(summary.count).toBe(3);
    expect(summary.monthly).toHaveLength(12);
    expect(summary.monthly[0].amount).toBe(30000); // January (index 0)
    expect(summary.monthly[2].amount).toBe(5000);  // March (index 2)
  });

  it("scopes to SUCCEEDED Stripe payments for the given year", async () => {
    prismaMock.payment.findMany.mockResolvedValue([]);
    await get1099Summary("c1", 2025);
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          provider: "STRIPE",
          status: "SUCCEEDED",
          paidAt: { gte: new Date(2025, 0, 1), lt: new Date(2026, 0, 1) },
        }),
      }),
    );
  });
});
