import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/test/setup";

// Mock Stripe client and finance settings
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
  getStripe: vi.fn(),
}));
vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn(),
  saveFinanceSettings: vi.fn(),
}));
vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { getTaxStatus, syncTaxRegistrations, calculateTax, recordTaxTransaction } from "./tax";
import { stripeConfigured, getStripe } from "@/lib/stripe/client";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { writeAudit } from "@/lib/modules/audit";

const mockStripeConfigured = stripeConfigured as ReturnType<typeof vi.fn>;
const mockGetStripe = getStripe as ReturnType<typeof vi.fn>;
const mockGetFinanceSettings = getFinanceSettings as ReturnType<typeof vi.fn>;
const mockSaveFinanceSettings = saveFinanceSettings as ReturnType<typeof vi.fn>;

/** Helper to build a minimal Stripe mock for tax operations. */
function makeStripeMock(overrides: Record<string, unknown> = {}) {
  return {
    tax: {
      settings: {
        retrieve: vi.fn().mockResolvedValue({ status: "active" }),
        update: vi.fn().mockResolvedValue({}),
      },
      registrations: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi.fn().mockResolvedValue({ id: "reg1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      calculations: {
        create: vi.fn().mockResolvedValue({
          tax_amount_exclusive: 850,
          id: "calc_abc",
          line_items: { data: [{ reference: "line1", amount_tax: 850 }] },
        }),
      },
      transactions: {
        createFromCalculation: vi.fn().mockResolvedValue({ id: "txn1" }),
      },
    },
    ...overrides,
  };
}

const DEFAULT_SETTINGS = {
  taxMode: "manual" as const,
  taxRegistrationStates: [],
  taxCode: "txcd_99999999",
  payoutProfile: { addressLine1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
};

describe("getTaxStatus", () => {
  it("returns configured:false when Stripe is not set up", async () => {
    mockStripeConfigured.mockReturnValue(false);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);

    const status = await getTaxStatus("c1");
    expect(status.configured).toBe(false);
    expect(status.available).toBe(false);
  });

  it("returns available:false when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);

    const status = await getTaxStatus("c1");
    expect(status.available).toBe(false);
  });

  it("returns active:true and lists registered states", async () => {
    mockStripeConfigured.mockReturnValue(true);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);

    const stripeMock = makeStripeMock();
    stripeMock.tax.settings.retrieve.mockResolvedValue({ status: "active" });
    stripeMock.tax.registrations.list.mockResolvedValue({
      data: [
        { status: "active", country_options: { us: { state: "TX" } } },
        { status: "active", country_options: { us: { state: "CA" } } },
        { status: "inactive", country_options: { us: { state: "NY" } } },
      ],
    });
    mockGetStripe.mockReturnValue(stripeMock);

    const status = await getTaxStatus("c1");
    expect(status.active).toBe(true);
    expect(status.registeredStates).toContain("TX");
    expect(status.registeredStates).toContain("CA");
    expect(status.registeredStates).not.toContain("NY");
  });

  it("treats Stripe Tax not initialized as not-active (swallows errors)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);

    const stripeMock = makeStripeMock();
    stripeMock.tax.settings.retrieve.mockRejectedValue(new Error("tax not enabled"));
    mockGetStripe.mockReturnValue(stripeMock);

    const status = await getTaxStatus("c1");
    expect(status.active).toBe(false);
    expect(status.available).toBe(true);
  });
});

describe("syncTaxRegistrations", () => {
  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(syncTaxRegistrations("c1", ["TX"])).rejects.toThrow("stripe_not_configured");
  });

  it("throws when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    await expect(syncTaxRegistrations("c1", ["TX"])).rejects.toThrow("no_account");
  });

  it("creates registrations for new states", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSaveFinanceSettings.mockResolvedValue(undefined);

    const stripeMock = makeStripeMock();
    // No existing registrations
    stripeMock.tax.registrations.list.mockResolvedValue({ data: [] });
    mockGetStripe.mockReturnValue(stripeMock);

    // Also need getTaxStatus to work after sync
    stripeMock.tax.settings.retrieve.mockResolvedValue({ status: "active" });

    await syncTaxRegistrations("c1", ["TX", "CA"]);

    expect(stripeMock.tax.settings.update).toHaveBeenCalledWith(
      expect.objectContaining({ defaults: expect.objectContaining({ tax_behavior: "exclusive" }) }),
      { stripeAccount: "acct_123" },
    );
    // Should create both TX and CA
    expect(stripeMock.tax.registrations.create).toHaveBeenCalledWith(
      expect.objectContaining({ country: "US", country_options: { us: { state: "TX", type: "state_sales_tax" } } }),
      { stripeAccount: "acct_123" },
    );
    expect(stripeMock.tax.registrations.create).toHaveBeenCalledWith(
      expect.objectContaining({ country_options: { us: { state: "CA", type: "state_sales_tax" } } }),
      { stripeAccount: "acct_123" },
    );
  });

  it("expires registrations that are no longer wanted", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSaveFinanceSettings.mockResolvedValue(undefined);

    const stripeMock = makeStripeMock();
    // TX was registered, now we want only CA
    stripeMock.tax.registrations.list.mockResolvedValue({
      data: [{ id: "reg_tx", status: "active", country_options: { us: { state: "TX" } } }],
    });
    stripeMock.tax.settings.retrieve.mockResolvedValue({ status: "active" });
    mockGetStripe.mockReturnValue(stripeMock);

    await syncTaxRegistrations("c1", ["CA"]);

    // TX should be expired
    expect(stripeMock.tax.registrations.update).toHaveBeenCalledWith(
      "reg_tx",
      { expires_at: "now" },
      { stripeAccount: "acct_123" },
    );
    // CA should be created
    expect(stripeMock.tax.registrations.create).toHaveBeenCalledWith(
      expect.objectContaining({ country_options: { us: { state: "CA", type: "state_sales_tax" } } }),
      { stripeAccount: "acct_123" },
    );
  });

  it("deduplicates and uppercases state codes", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSaveFinanceSettings.mockResolvedValue(undefined);

    const stripeMock = makeStripeMock();
    stripeMock.tax.registrations.list.mockResolvedValue({ data: [] });
    stripeMock.tax.settings.retrieve.mockResolvedValue({ status: "active" });
    mockGetStripe.mockReturnValue(stripeMock);

    await syncTaxRegistrations("c1", ["tx", "TX", "tx"]); // duplicates + lowercase

    // Should only create one TX registration
    const calls = stripeMock.tax.registrations.create.mock.calls as Array<[{ country_options: { us: { state: string } } }, unknown]>;
    const states = calls.map((c) => c[0].country_options.us.state);
    const txCalls = states.filter((s) => s === "TX");
    expect(txCalls).toHaveLength(1);
  });

  it("writes an audit log after sync", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSaveFinanceSettings.mockResolvedValue(undefined);

    const stripeMock = makeStripeMock();
    stripeMock.tax.registrations.list.mockResolvedValue({ data: [] });
    stripeMock.tax.settings.retrieve.mockResolvedValue({ status: "active" });
    mockGetStripe.mockReturnValue(stripeMock);

    await syncTaxRegistrations("c1", ["TX"]);

    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "finance.tax_registrations_synced", clientId: "c1" }),
    );
  });
});

describe("calculateTax", () => {
  it("returns zero tax when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    const result = await calculateTax("c1", {
      currency: "usd",
      lines: [{ amount: 10000, reference: "line1" }],
      address: { country: "US", state: "TX" },
    });
    expect(result).toEqual({ tax: 0, lineTax: {}, calculationId: null });
  });

  it("returns zero tax when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    const result = await calculateTax("c1", {
      currency: "usd",
      lines: [{ amount: 10000, reference: "line1" }],
      address: { country: "US", state: "TX" },
    });
    expect(result).toEqual({ tax: 0, lineTax: {}, calculationId: null });
  });

  it("returns zero tax when address is insufficient to locate customer", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const result = await calculateTax("c1", {
      currency: "usd",
      lines: [{ amount: 10000, reference: "line1" }],
      address: { country: "US" }, // no state or postalCode
    });
    expect(result).toEqual({ tax: 0, lineTax: {}, calculationId: null });
  });

  it("calls Stripe tax.calculations.create with correct params and returns tax in integer cents", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue(DEFAULT_SETTINGS);

    const stripeMock = makeStripeMock();
    stripeMock.tax.calculations.create.mockResolvedValue({
      tax_amount_exclusive: 825,
      id: "calc_123",
      line_items: {
        data: [
          { reference: "item-1", amount_tax: 500 },
          { reference: "item-2", amount_tax: 325 },
        ],
      },
    });
    mockGetStripe.mockReturnValue(stripeMock);

    const result = await calculateTax("c1", {
      currency: "usd",
      lines: [
        { amount: 5000, reference: "item-1", taxCode: "txcd_10000000" },
        { amount: 3000, reference: "item-2" },
      ],
      address: { country: "US", state: "TX", postalCode: "78701", city: "Austin", line1: "123 Main" },
    });

    // Money must be integer cents
    expect(Number.isInteger(result.tax)).toBe(true);
    expect(result.tax).toBe(825);
    expect(result.calculationId).toBe("calc_123");
    expect(result.lineTax).toEqual({ "item-1": 500, "item-2": 325 });

    expect(stripeMock.tax.calculations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "usd",
        customer_details: expect.objectContaining({
          address: expect.objectContaining({ country: "US", state: "TX" }),
          address_source: "billing",
        }),
      }),
      { stripeAccount: "acct_123" },
    );
  });

  it("uses the client's taxCode setting when no per-line override", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    mockGetFinanceSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, taxCode: "txcd_20030000" });

    const stripeMock = makeStripeMock();
    mockGetStripe.mockReturnValue(stripeMock);

    await calculateTax("c1", {
      currency: "usd",
      lines: [{ amount: 5000, reference: "item-1" }],
      address: { country: "US", state: "TX" },
    });

    const call = stripeMock.tax.calculations.create.mock.calls[0][0] as { line_items: Array<{ tax_code: string }> };
    expect(call.line_items[0].tax_code).toBe("txcd_20030000");
  });
});

describe("recordTaxTransaction", () => {
  it("is a no-op when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(recordTaxTransaction("c1", "calc_123", "INV-001")).resolves.toBeUndefined();
  });

  it("is a no-op when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    await expect(recordTaxTransaction("c1", "calc_123", "INV-001")).resolves.toBeUndefined();
  });

  it("creates a tax transaction on the connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);

    const stripeMock = makeStripeMock();
    mockGetStripe.mockReturnValue(stripeMock);

    await recordTaxTransaction("c1", "calc_abc", "INV-007");

    expect(stripeMock.tax.transactions.createFromCalculation).toHaveBeenCalledWith(
      { calculation: "calc_abc", reference: "INV-007" },
      { stripeAccount: "acct_123" },
    );
  });
});
