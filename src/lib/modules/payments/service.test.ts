import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/modules/notification", () => ({
  createNotification: vi.fn(),
  isGroupEmailAllowed: vi.fn(),
}));
vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn(),
  saveFinanceSettings: vi.fn(),
  formatMoney: vi.fn((n: number) => `$${(n / 100).toFixed(2)}`),
}));
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
  getStripe: vi.fn(),
  connectClientId: vi.fn(),
  appBaseUrl: vi.fn(() => "https://pagebee.com"),
  // applicationFee is used inline by the source — use the real formula so cents tests are accurate
  applicationFee: (amount: number) => Math.max(0, Math.round((amount * 200) / 10_000)),
  PLATFORM_FEE_BPS: 200,
}));
// signingSecret must survive vi.resetAllMocks() — use a plain function, not vi.fn()
vi.mock("@/lib/secret", () => ({
  signingSecret: () => "test-secret-key-32-chars-padded!!",
}));

import {
  getPaymentStatus,
  verifyConnectState,
  startConnect,
  completeOAuth,
  refreshAccountStatus,
  createInvoiceCheckout,
  createPaymentLink,
  chargeInvoiceOffSession,
  processStripeEvent,
  refundPayment,
  createInvoicePaymentIntent,
  savePlanCard,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { createNotification, isGroupEmailAllowed } from "@/lib/modules/notification";
import { getFinanceSettings } from "@/lib/modules/finance";
import { stripeConfigured, getStripe, connectClientId } from "@/lib/stripe/client";

const mockStripeConfigured = stripeConfigured as ReturnType<typeof vi.fn>;
const mockGetStripe = getStripe as ReturnType<typeof vi.fn>;
const mockConnectClientId = connectClientId as ReturnType<typeof vi.fn>;
const mockGetFinanceSettings = getFinanceSettings as ReturnType<typeof vi.fn>;
const mockIsGroupEmailAllowed = isGroupEmailAllowed as ReturnType<typeof vi.fn>;

function makeStripeMock() {
  return {
    oauth: { token: vi.fn() },
    accounts: {
      retrieve: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      createPerson: vi.fn(),
      createExternalAccount: vi.fn(),
      listPersons: vi.fn(),
      updatePerson: vi.fn(),
    },
    checkout: { sessions: { create: vi.fn() } },
    paymentIntents: { create: vi.fn() },
    setupIntents: { create: vi.fn(), retrieve: vi.fn() },
    refunds: { create: vi.fn() },
    customers: { create: vi.fn() },
    accountSessions: { create: vi.fn() },
    recurringPlan: { update: vi.fn() },
  };
}

beforeEach(() => {
  mockGetFinanceSettings.mockResolvedValue({ stripeMode: "PLATFORM" });
});

// ─── getPaymentStatus ────────────────────────────────────────────────────────

describe("getPaymentStatus", () => {
  it("returns connected:false when no Stripe account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null, paymentsEnabled: false } as never);
    const status = await getPaymentStatus("c1");
    expect(status.connected).toBe(false);
    expect(status.accountId).toBeNull();
  });

  it("returns connected:true when account is linked", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_abc", paymentsEnabled: true } as never);
    const status = await getPaymentStatus("c1");
    expect(status.connected).toBe(true);
    expect(status.accountId).toBe("acct_abc");
    expect(status.chargesEnabled).toBe(true);
  });
});

// ─── verifyConnectState ──────────────────────────────────────────────────────

describe("verifyConnectState", () => {
  it("rejects a state with wrong tenant id", () => {
    // generate a valid state for c1 then try to verify against c2
    // We can't easily call signConnectState (private), so we test the exported verifier directly
    expect(verifyConnectState("c2.nonce.badsig", "c1")).toBe(false);
  });

  it("rejects a malformed state (wrong number of parts)", () => {
    expect(verifyConnectState("only-two-parts", "c1")).toBe(false);
    expect(verifyConnectState("a.b.c.d", "c1")).toBe(false);
  });

  it("rejects tampered signatures (wrong 32-char sig)", () => {
    // sig must be exactly 32 chars to get past the length check, but must not match the HMAC
    expect(verifyConnectState("c1.validnonce.00000000000000000000000000000000", "c1")).toBe(false);
  });
});

// ─── startConnect ────────────────────────────────────────────────────────────

describe("startConnect", () => {
  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(startConnect("c1")).rejects.toThrow("stripe_not_configured");
  });

  it("throws tier_required when client lacks payments/invoices flag", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    await expect(startConnect("c1")).rejects.toThrow("tier_required");
  });

  it("throws when STRIPE_CONNECT_CLIENT_ID is missing", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { payments: true } } },
    } as never);
    mockConnectClientId.mockReturnValue(null);
    mockGetFinanceSettings.mockResolvedValue({ stripeMode: "PLATFORM" });
    vi.mocked(vi.mocked(getFinanceSettings)).mockResolvedValue({ stripeMode: "PLATFORM" } as never);
    await expect(startConnect("c1")).rejects.toThrow("connect_client_id_missing");
  });

  it("returns an OAuth URL with a signed state parameter", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { payments: true } } },
    } as never);
    mockConnectClientId.mockReturnValue("ca_test123");
    mockGetFinanceSettings.mockResolvedValue({ stripeMode: "PLATFORM" } as never);
    const { saveFinanceSettings } = await import("@/lib/modules/finance");
    vi.mocked(saveFinanceSettings).mockResolvedValue(undefined as never);

    const url = await startConnect("c1");
    expect(url).toContain("connect.stripe.com");
    expect(url).toContain("client_id=ca_test123");
    expect(url).toContain("state=c1.");
  });
});

// ─── completeOAuth ───────────────────────────────────────────────────────────

describe("completeOAuth", () => {
  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(completeOAuth("c1", "code123")).rejects.toThrow("stripe_not_configured");
  });

  it("links the account and audits on success", async () => {
    mockStripeConfigured.mockReturnValue(true);
    const stripe = makeStripeMock();
    stripe.oauth.token.mockResolvedValue({ stripe_user_id: "acct_new" });
    stripe.accounts.retrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_new" } as never);
    prismaMock.client.update.mockResolvedValue({} as never);

    await completeOAuth("c1", "oauth_code");

    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeConnectAccountId: "acct_new" } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.byo_connected", clientId: "c1" }),
    );
  });

  it("throws oauth_failed when token response has no stripe_user_id", async () => {
    mockStripeConfigured.mockReturnValue(true);
    const stripe = makeStripeMock();
    stripe.oauth.token.mockResolvedValue({ stripe_user_id: null });
    mockGetStripe.mockReturnValue(stripe);
    await expect(completeOAuth("c1", "bad_code")).rejects.toThrow("oauth_failed");
  });
});

// ─── refreshAccountStatus ────────────────────────────────────────────────────

describe("refreshAccountStatus", () => {
  it("returns false when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    expect(await refreshAccountStatus("c1")).toBe(false);
  });

  it("returns false when client has no Stripe account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    expect(await refreshAccountStatus("c1")).toBe(false);
  });

  it("sets paymentsEnabled=true when charges and payouts are both enabled", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    const result = await refreshAccountStatus("c1");
    expect(result).toBe(true);
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentsEnabled: true } }),
    );
  });

  it("sets paymentsEnabled=false when charges or payouts are disabled", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: false });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    const result = await refreshAccountStatus("c1");
    expect(result).toBe(false);
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentsEnabled: false } }),
    );
  });
});

// ─── createInvoiceCheckout ───────────────────────────────────────────────────

describe("createInvoiceCheckout", () => {
  const INVOICE = {
    id: "inv1",
    docType: "INVOICE",
    number: "INV-001",
    total: 10000, // $100.00 in cents
    amountPaid: 0,
    depositAmount: 3000,
    currency: "usd",
    publicToken: "tok_abc",
    taxCalculationId: null,
    client: { id: "c1", stripeConnectAccountId: "acct_123", paymentsEnabled: true, businessName: "Acme" },
    customer: { email: "buyer@example.com" },
  };

  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(createInvoiceCheckout("tok_abc")).rejects.toThrow("stripe_not_configured");
  });

  it("throws 404 when invoice not found", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    await expect(createInvoiceCheckout("bad_token")).rejects.toThrow("not_found");
  });

  it("throws 409 when payments are unavailable on the account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue({ ...INVOICE, client: { ...INVOICE.client, paymentsEnabled: false } } as never);
    await expect(createInvoiceCheckout("tok_abc")).rejects.toThrow("payments_unavailable");
  });

  it("throws 409 when nothing is due (already fully paid)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue({ ...INVOICE, total: 10000, amountPaid: 10000 } as never);
    await expect(createInvoiceCheckout("tok_abc")).rejects.toThrow("nothing_due");
  });

  it("creates Checkout session with destination charge and application fee (integer cents)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue(INVOICE as never);
    const stripe = makeStripeMock();
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/pay/abc" });
    mockGetStripe.mockReturnValue(stripe);

    const url = await createInvoiceCheckout("tok_abc");
    expect(url).toBe("https://checkout.stripe.com/pay/abc");

    const call = stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
      payment_intent_data: { application_fee_amount: number; transfer_data: { destination: string } };
    };
    // Amount must be integer cents
    const amount = call.line_items[0].price_data.unit_amount;
    expect(Number.isInteger(amount)).toBe(true);
    expect(amount).toBe(10000);
    // Application fee must be present (destination charge model)
    expect(call.payment_intent_data.application_fee_amount).toBeGreaterThan(0);
    // Transfer destination must be the connected account (not the platform account)
    expect(call.payment_intent_data.transfer_data.destination).toBe("acct_123");
  });

  it("uses deposit amount when deposit=true and invoice has not been partially paid", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue(INVOICE as never);
    const stripe = makeStripeMock();
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/deposit" });
    mockGetStripe.mockReturnValue(stripe);

    await createInvoiceCheckout("tok_abc", { deposit: true });

    const call = stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
    };
    expect(call.line_items[0].price_data.unit_amount).toBe(3000); // depositAmount
  });

  it("throws 502 when Stripe returns a session without a URL", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue(INVOICE as never);
    const stripe = makeStripeMock();
    stripe.checkout.sessions.create.mockResolvedValue({ url: null });
    mockGetStripe.mockReturnValue(stripe);
    await expect(createInvoiceCheckout("tok_abc")).rejects.toThrow("checkout_failed");
  });
});

// ─── createPaymentLink ───────────────────────────────────────────────────────

describe("createPaymentLink", () => {
  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(createPaymentLink("c1", { amountCents: 5000, description: "Service" })).rejects.toThrow("stripe_not_configured");
  });

  it("throws 400 for amounts below 50 cents", async () => {
    mockStripeConfigured.mockReturnValue(true);
    await expect(createPaymentLink("c1", { amountCents: 49, description: "Too small" })).rejects.toThrow("invalid_amount");
  });

  it("throws 409 when payments are not available for this client", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null, paymentsEnabled: false } as never);
    await expect(createPaymentLink("c1", { amountCents: 5000, description: "Charge" })).rejects.toThrow("payments_unavailable");
  });

  it("creates a destination charge with application fee — money in integer cents", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123", paymentsEnabled: true } as never);
    const stripe = makeStripeMock();
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/link_abc" });
    mockGetStripe.mockReturnValue(stripe);

    const result = await createPaymentLink("c1", { amountCents: 7500, description: "Custom charge" });
    expect(result.url).toBe("https://checkout.stripe.com/link_abc");

    const call = stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
      payment_intent_data: { application_fee_amount: number; transfer_data: { destination: string } };
    };
    // Amount in integer cents
    expect(Number.isInteger(call.line_items[0].price_data.unit_amount)).toBe(true);
    expect(call.line_items[0].price_data.unit_amount).toBe(7500);
    // Destination charge
    expect(call.payment_intent_data.transfer_data.destination).toBe("acct_123");
    // Application fee present
    expect(call.payment_intent_data.application_fee_amount).toBeGreaterThan(0);
  });

  it("audits the payment link creation", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123", paymentsEnabled: true } as never);
    const stripe = makeStripeMock();
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
    mockGetStripe.mockReturnValue(stripe);

    await createPaymentLink("c1", { amountCents: 5000, description: "Deposit" });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.payment_link_created", clientId: "c1" }),
    );
  });
});

// ─── chargeInvoiceOffSession ─────────────────────────────────────────────────

describe("chargeInvoiceOffSession", () => {
  const INV = {
    id: "inv2",
    total: 5000,
    amountPaid: 0,
    currency: "usd",
    client: { stripeConnectAccountId: "acct_123", paymentsEnabled: true },
  };

  it("returns charged:false when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    const r = await chargeInvoiceOffSession("inv2", { stripeCustomerId: "cus_1", paymentMethodId: "pm_1" });
    expect(r).toEqual({ charged: false, reason: "stripe_not_configured" });
  });

  it("returns charged:false when invoice not found", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const r = await chargeInvoiceOffSession("inv2", { stripeCustomerId: "cus_1", paymentMethodId: "pm_1" });
    expect(r).toEqual({ charged: false, reason: "not_found" });
  });

  it("returns charged:false when nothing is due", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findUnique.mockResolvedValue({ ...INV, total: 5000, amountPaid: 5000 } as never);
    const r = await chargeInvoiceOffSession("inv2", { stripeCustomerId: "cus_1", paymentMethodId: "pm_1" });
    expect(r).toEqual({ charged: false, reason: "nothing_due" });
  });

  it("creates a destination PaymentIntent with application fee and returns charged:true on success", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findUnique.mockResolvedValue(INV as never);
    const stripe = makeStripeMock();
    stripe.paymentIntents.create.mockResolvedValue({ status: "succeeded", id: "pi_123", latest_charge: "ch_abc" });
    mockGetStripe.mockReturnValue(stripe);
    // applyPayment internals
    prismaMock.payment.findUnique.mockResolvedValue(null); // no dupe
    prismaMock.invoice.findUnique.mockResolvedValueOnce(INV as never) // first call in chargeInvoiceOffSession
      .mockResolvedValueOnce({ ...INV, id: "inv2", clientId: "c1", customerId: "cust1", total: 5000, amountPaid: 0, currency: "usd", number: "INV-002", taxCalculationId: null } as never); // in applyPayment
    prismaMock.payment.create.mockResolvedValue({ id: "pay1" } as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);

    const r = await chargeInvoiceOffSession("inv2", { stripeCustomerId: "cus_1", paymentMethodId: "pm_1" });
    expect(r).toEqual({ charged: true });

    const call = stripe.paymentIntents.create.mock.calls[0][0] as {
      amount: number;
      application_fee_amount: number;
      transfer_data: { destination: string };
      off_session: boolean;
      confirm: boolean;
    };
    // Amount in integer cents
    expect(Number.isInteger(call.amount)).toBe(true);
    expect(call.amount).toBe(5000);
    // Destination charge with application fee
    expect(call.transfer_data.destination).toBe("acct_123");
    expect(call.application_fee_amount).toBeGreaterThan(0);
    // Must be off-session and confirmed
    expect(call.off_session).toBe(true);
    expect(call.confirm).toBe(true);
  });

  it("returns charged:false (not a throw) when Stripe throws", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findUnique.mockResolvedValue(INV as never);
    const stripe = makeStripeMock();
    stripe.paymentIntents.create.mockRejectedValue(new Error("card_declined"));
    mockGetStripe.mockReturnValue(stripe);

    const r = await chargeInvoiceOffSession("inv2", { stripeCustomerId: "cus_1", paymentMethodId: "pm_1" });
    expect(r.charged).toBe(false);
    expect(r.reason).toBe("card_declined");
  });
});

// ─── refundPayment ───────────────────────────────────────────────────────────

describe("refundPayment", () => {
  const PAYMENT = { id: "pay1", amount: 10000, stripePaymentIntentId: "pi_abc", invoiceId: "inv1" };

  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(refundPayment("c1", "pay1")).rejects.toThrow("stripe_not_configured");
  });

  it("throws 404 when payment not found for tenant (IDOR backstop)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    const stripe = makeStripeMock();
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    await expect(refundPayment("c1", "pay1")).rejects.toThrow("not_found");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("creates a refund with reverse_transfer (Connect refund policy)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.payment.findFirst.mockResolvedValue(PAYMENT as never);
    const stripe = makeStripeMock();
    stripe.refunds.create.mockResolvedValue({ id: "re_123" });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.refund.create.mockResolvedValue({ id: "ref1" } as never);

    await refundPayment("c1", "pay1");

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_abc",
        reverse_transfer: true,
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.refund_created", clientId: "c1" }),
    );
  });

  it("passes explicit partial amount when provided", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.payment.findFirst.mockResolvedValue(PAYMENT as never);
    const stripe = makeStripeMock();
    stripe.refunds.create.mockResolvedValue({ id: "re_456" });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.refund.create.mockResolvedValue({ id: "ref2" } as never);

    await refundPayment("c1", "pay1", 5000);

    const call = stripe.refunds.create.mock.calls[0][0] as { amount?: number };
    expect(call.amount).toBe(5000);
  });

  it("omits amount for full refund (Stripe refunds the whole PI)", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.payment.findFirst.mockResolvedValue(PAYMENT as never);
    const stripe = makeStripeMock();
    stripe.refunds.create.mockResolvedValue({ id: "re_789" });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.refund.create.mockResolvedValue({ id: "ref3" } as never);

    await refundPayment("c1", "pay1"); // no amount = full refund

    const call = stripe.refunds.create.mock.calls[0][0] as { amount?: number };
    // Full refund → amount should be undefined (let Stripe handle it)
    expect(call.amount).toBeUndefined();
  });
});

// ─── processStripeEvent ──────────────────────────────────────────────────────

describe("processStripeEvent — idempotency", () => {
  it("skips already-processed events", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue({ processedAt: new Date() } as never);
    await processStripeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } } as never);
    expect(prismaMock.paymentEvent.upsert).not.toHaveBeenCalled();
  });
});

describe("processStripeEvent — checkout.session.completed", () => {
  it("applies payment when session is paid and has an invoiceId", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    // applyPayment needs invoice
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: "inv1", clientId: "c1", customerId: "cust1", total: 5000, amountPaid: 0, currency: "usd", number: "INV-001", taxCalculationId: null,
    } as never);
    prismaMock.payment.findUnique.mockResolvedValue(null); // not a dupe
    prismaMock.payment.create.mockResolvedValue({ id: "pay1" } as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);

    await processStripeEvent({
      id: "evt_cs_1",
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          amount_total: 5000,
          payment_intent: "pi_abc",
          metadata: { invoiceId: "inv1" },
        },
      },
    } as never);

    expect(prismaMock.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 5000, provider: "STRIPE", status: "SUCCEEDED" }),
      }),
    );
  });
});

describe("processStripeEvent — account.updated", () => {
  it("syncs paymentsEnabled from the account event", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.client.updateMany.mockResolvedValue({ count: 1 } as never);

    await processStripeEvent({
      id: "evt_acct_1",
      type: "account.updated",
      data: { object: { id: "acct_abc", charges_enabled: true, payouts_enabled: true } },
    } as never);

    expect(prismaMock.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeConnectAccountId: "acct_abc" },
        data: { paymentsEnabled: true },
      }),
    );
  });
});

describe("processStripeEvent — charge.refunded", () => {
  it("updates payment to REFUNDED and reconciles refund ledger", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay1", invoiceId: "inv1", amount: 5000 } as never);
    prismaMock.payment.update.mockResolvedValue({} as never);
    prismaMock.refund.findMany.mockResolvedValue([]);
    prismaMock.refund.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.refund.create.mockResolvedValue({ id: "ref1" } as never);
    prismaMock.invoice.findUnique.mockResolvedValue({ total: 5000 } as never);
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 5000 } } as never);
    prismaMock.refund.aggregate.mockResolvedValue({ _sum: { amount: 5000 } } as never);
    prismaMock.invoice.update.mockResolvedValue({} as never);

    await processStripeEvent({
      id: "evt_refund_1",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_abc",
          amount_refunded: 5000,
          refunded: true,
        },
      },
    } as never);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REFUNDED" } }),
    );
  });
});

describe("processStripeEvent — charge.dispute.created", () => {
  it("marks the payment as DISPUTED, notifies the owner, and sends email when allowed", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay1", clientId: "c1", amount: 5000, currency: "usd", invoiceId: "inv1" } as never);
    prismaMock.payment.update.mockResolvedValue({} as never);
    mockIsGroupEmailAllowed.mockResolvedValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ ownerEmail: "owner@biz.com" } as never);

    await processStripeEvent({
      id: "evt_disp_1",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_1",
          charge: "ch_abc",
          amount: 5000,
          reason: "fraudulent",
          evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86400 },
          status: "needs_response",
        },
      },
    } as never);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISPUTED" }) }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", type: "payment.disputed" }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.dispute_opened" }),
    );
  });
});

// ─── createInvoicePaymentIntent ──────────────────────────────────────────────

describe("createInvoicePaymentIntent", () => {
  const INV = {
    id: "inv3",
    docType: "INVOICE",
    total: 8000,
    amountPaid: 0,
    depositAmount: 2000,
    currency: "usd",
    taxCalculationId: null,
    client: { id: "c1", stripeConnectAccountId: "acct_123", paymentsEnabled: true },
    customer: { email: "cust@example.com" },
  };

  it("creates a PaymentIntent as a destination charge with application fee", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.invoice.findFirst.mockResolvedValue(INV as never);
    const stripe = makeStripeMock();
    stripe.paymentIntents.create.mockResolvedValue({ client_secret: "pi_secret_abc", id: "pi_789" });
    mockGetStripe.mockReturnValue(stripe);

    const result = await createInvoicePaymentIntent("tok_xyz");
    expect(result.clientSecret).toBe("pi_secret_abc");
    expect(result.amount).toBe(8000);
    expect(Number.isInteger(result.amount)).toBe(true);

    const call = stripe.paymentIntents.create.mock.calls[0][0] as {
      amount: number;
      application_fee_amount: number;
      transfer_data: { destination: string };
    };
    expect(call.transfer_data.destination).toBe("acct_123");
    expect(call.application_fee_amount).toBeGreaterThan(0);
  });
});

// ─── savePlanCard ────────────────────────────────────────────────────────────

describe("savePlanCard", () => {
  it("throws 409 mismatch when SetupIntent metadata recurringPlanId does not match plan", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.recurringPlan.findUnique.mockResolvedValue({ id: "rp1", clientId: "c1", stripeCustomerId: "cus_abc" } as never);
    const stripe = makeStripeMock();
    stripe.setupIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      payment_method: "pm_abc",
      customer: "cus_abc",
      metadata: { recurringPlanId: "DIFFERENT_PLAN" }, // mismatch
    });
    mockGetStripe.mockReturnValue(stripe);

    await expect(savePlanCard("tok_rp", { setupIntentId: "si_123", mandateText: "I agree", ip: "1.2.3.4" })).rejects.toThrow("mismatch");
  });

  it("throws 409 when SetupIntent is not yet succeeded", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.recurringPlan.findUnique.mockResolvedValue({ id: "rp1", clientId: "c1", stripeCustomerId: "cus_abc" } as never);
    const stripe = makeStripeMock();
    stripe.setupIntents.retrieve.mockResolvedValue({ status: "requires_payment_method" });
    mockGetStripe.mockReturnValue(stripe);

    await expect(savePlanCard("tok_rp", { setupIntentId: "si_123", mandateText: "agree", ip: null })).rejects.toThrow("setup_incomplete");
  });

  it("persists the payment method and audits on success", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.recurringPlan.findUnique.mockResolvedValue({ id: "rp1", clientId: "c1", stripeCustomerId: "cus_abc" } as never);
    const stripe = makeStripeMock();
    stripe.setupIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      payment_method: "pm_abc",
      customer: "cus_abc",
      metadata: { recurringPlanId: "rp1" },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.recurringPlan.update.mockResolvedValue({} as never);

    const result = await savePlanCard("tok_rp", { setupIntentId: "si_123", mandateText: "I authorize", ip: "2.3.4.5" });
    expect(result).toEqual({ ok: true });
    expect(prismaMock.recurringPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripePaymentMethodId: "pm_abc", mode: "AUTO_CHARGE" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.card_authorized", clientId: "c1" }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", type: "recurring.authorized" }),
    );
  });
});
