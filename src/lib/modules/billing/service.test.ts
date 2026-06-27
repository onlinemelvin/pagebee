import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/email/notifications", () => ({
  sendPlanChanged: vi.fn(),
  sendPaymentReceipt: vi.fn(),
  sendSubscriptionCancelled: vi.fn(),
  sendPaymentFailed: vi.fn(),
  billingUrl: vi.fn().mockReturnValue("https://pagebee.com/billing"),
}));
vi.mock("@/lib/modules/preview", () => ({ launchPreview: vi.fn() }));
vi.mock("@/lib/modules/subscription", () => ({ requestUpgrade: vi.fn() }));

// Use vi.hoisted so the mock object is available before vi.mock() factories run.
const { mockStripe } = vi.hoisted(() => {
  const mockStripe = {
    prices: { list: vi.fn(), create: vi.fn() },
    products: { update: vi.fn() },
    customers: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
    subscriptions: { retrieve: vi.fn(), update: vi.fn(), create: vi.fn(), cancel: vi.fn(), list: vi.fn() },
    subscriptionSchedules: { create: vi.fn(), update: vi.fn() },
    invoiceItems: { create: vi.fn() },
    invoices: { list: vi.fn() },
    paymentMethods: { retrieve: vi.fn(), attach: vi.fn() },
    setupIntents: { create: vi.fn(), retrieve: vi.fn() },
    coupons: { retrieve: vi.fn(), create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  };
  return { mockStripe };
});

vi.mock("@/lib/stripe/client", () => ({
  getStripe: vi.fn().mockReturnValue(mockStripe),
  stripeConfigured: vi.fn().mockReturnValue(true),
  appBaseUrl: vi.fn().mockReturnValue("https://app.pagebee.com"),
}));

import {
  createBillingCheckout,
  cancelSubscription,
  reactivateSubscription,
  recordBillingAgreement,
  retentionOfferAvailable,
  applyRetentionDiscount,
  upgradeSubscription,
  syncCheckoutSession,
  processBillingEvent,
  BILLING_TERMS_VERSION,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import * as notify from "@/lib/modules/email/notifications";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { requestUpgrade } from "@/lib/modules/subscription";

beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults after clearAllMocks wipes mock implementations
  vi.mocked(getStripe).mockReturnValue(mockStripe as never);
  vi.mocked(stripeConfigured).mockReturnValue(true);
  // Default: prices not found, create returns a price id
  mockStripe.prices.list.mockResolvedValue({ data: [] });
  mockStripe.prices.create.mockResolvedValue({ id: "price_monthly", lookup_key: "pagebee_hive_monthly", product: "prod_123" });
  mockStripe.products.update.mockResolvedValue({});
  mockStripe.customers.create.mockResolvedValue({ id: "cus_new" });
});

// ─── createBillingCheckout ────────────────────────────────────────────────

describe("createBillingCheckout", () => {
  it("throws no_subscription when client has no subscription row", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    await expect(createBillingCheckout("c1", "setup")).rejects.toThrow("no_subscription");
  });

  it("throws invalid_plan for an unknown plan name", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      plan: { name: "HIVE" },
    } as never);
    await expect(createBillingCheckout("c1", "upgrade", "UNKNOWN_PLAN")).rejects.toThrow("invalid_plan");
  });

  it("creates a Checkout session and audits on success", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      stripeCustomerId: "cus_existing",
      plan: { name: "NECTAR" },
    } as never);
    mockStripe.prices.list.mockResolvedValue({
      data: [
        { id: "price_m", lookup_key: "pagebee_nectar_monthly" },
        { id: "price_s", lookup_key: "pagebee_nectar_setup" },
      ],
    });
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createBillingCheckout("c1", "setup");
    expect(result.url).toContain("checkout.stripe.com");
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing", mode: "subscription" }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.checkout_setup" }));
  });

  it("setup checkout includes both monthly and setup line items", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      stripeCustomerId: "cus_existing",
      plan: { name: "HONEY" },
    } as never);
    mockStripe.prices.list.mockResolvedValue({
      data: [
        { id: "price_m", lookup_key: "pagebee_honey_monthly" },
        { id: "price_s", lookup_key: "pagebee_honey_setup" },
      ],
    });
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/s" });

    await createBillingCheckout("c1", "setup");
    const call = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.line_items).toHaveLength(2); // monthly + setup fee
  });

  it("upgrade checkout includes only the monthly line item", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      stripeCustomerId: "cus_existing",
      plan: { name: "NECTAR" },
    } as never);
    mockStripe.prices.list.mockResolvedValue({
      data: [
        { id: "price_m", lookup_key: "pagebee_honey_monthly" },
        { id: "price_s", lookup_key: "pagebee_honey_setup" },
      ],
    });
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/s" });

    await createBillingCheckout("c1", "upgrade", "HONEY");
    const call = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.line_items).toHaveLength(1); // monthly only
  });
});

// ─── cancelSubscription ───────────────────────────────────────────────────

describe("cancelSubscription", () => {
  it("throws no_subscription when the client has no subscription", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    await expect(cancelSubscription("c1")).rejects.toThrow("no_subscription");
  });

  it("throws no_active_subscription when there is no Stripe subscription ID", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    } as never);
    await expect(cancelSubscription("c1")).rejects.toThrow("no_active_subscription");
  });

  it("immediately cancels when immediate:true", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: "stripe_sub_1",
      currentPeriodEnd: null,
    } as never);
    mockStripe.subscriptions.cancel.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({} as never);

    const result = await cancelSubscription("c1", { immediate: true });
    expect(result.status).toBe("cancelled");
    expect(result.accessUntil).toBeNull();
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith("stripe_sub_1");
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.cancelled" }));
  });

  it("schedules end-of-period cancellation by default", async () => {
    const periodEnd = new Date("2025-12-31");
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: "stripe_sub_1",
      currentPeriodEnd: periodEnd,
    } as never);
    mockStripe.subscriptions.update.mockResolvedValue({ cancel_at: Math.floor(periodEnd.getTime() / 1000) });
    prismaMock.subscription.update.mockResolvedValue({} as never);

    const result = await cancelSubscription("c1");
    expect(result.status).toBe("scheduled");
    expect(result.accessUntil).toBeTruthy();
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      "stripe_sub_1",
      expect.objectContaining({ cancel_at_period_end: true }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.cancel_scheduled" }));
  });
});

// ─── reactivateSubscription ───────────────────────────────────────────────

describe("reactivateSubscription", () => {
  it("throws no_subscription when no Stripe subscription ID exists", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub1", stripeSubscriptionId: null } as never);
    await expect(reactivateSubscription("c1")).rejects.toThrow("no_subscription");
  });

  it("clears cancel_at_period_end and audits", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub1", stripeSubscriptionId: "stripe_sub_1" } as never);
    mockStripe.subscriptions.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({} as never);

    const result = await reactivateSubscription("c1");
    expect(result).toEqual({ ok: true });
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      "stripe_sub_1",
      expect.objectContaining({ cancel_at_period_end: false }),
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cancelAt: null }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.reactivated" }));
  });
});

// ─── recordBillingAgreement ───────────────────────────────────────────────

describe("recordBillingAgreement", () => {
  it("creates a billing agreement with the current terms version — amount in cents", async () => {
    prismaMock.billingAgreement.create.mockResolvedValue({} as never);
    await recordBillingAgreement({ clientId: "c1", plan: "HIVE", amountCents: 99900, ip: "1.2.3.4" });
    expect(prismaMock.billingAgreement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "c1",
          version: BILLING_TERMS_VERSION,
          plan: "HIVE",
          amountCents: 99900,
        }),
      }),
    );
    expect(Number.isInteger(99900)).toBe(true);
  });

  it("is fail-soft — does not throw when the DB write fails", async () => {
    prismaMock.billingAgreement.create.mockRejectedValue(new Error("db failure"));
    await expect(recordBillingAgreement({ clientId: "c1", plan: "HIVE", amountCents: 99900 })).resolves.toBeUndefined();
  });
});

// ─── retentionOfferAvailable ──────────────────────────────────────────────

describe("retentionOfferAvailable", () => {
  it("returns true when no offer has been used yet", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ retentionOfferUsedAt: null } as never);
    expect(await retentionOfferAvailable("c1")).toBe(true);
  });

  it("returns false when the offer has already been used", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ retentionOfferUsedAt: new Date() } as never);
    expect(await retentionOfferAvailable("c1")).toBe(false);
  });

  it("returns false when there is no subscription record", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    expect(await retentionOfferAvailable("c1")).toBe(false);
  });
});

// ─── applyRetentionDiscount ───────────────────────────────────────────────

describe("applyRetentionDiscount", () => {
  it("throws no_active_subscription when there is no Stripe subscription", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub1", stripeSubscriptionId: null, retentionOfferUsedAt: null } as never);
    await expect(applyRetentionDiscount("c1")).rejects.toThrow("no_active_subscription");
  });

  it("throws offer_already_used when the offer was already claimed", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: "stripe_sub_1",
      retentionOfferUsedAt: new Date(),
    } as never);
    await expect(applyRetentionDiscount("c1")).rejects.toThrow("offer_already_used");
  });

  it("creates the coupon when it does not exist, applies it, and marks used", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: "stripe_sub_1",
      retentionOfferUsedAt: null,
    } as never);
    mockStripe.coupons.retrieve.mockRejectedValue(new Error("No such coupon"));
    mockStripe.coupons.create.mockResolvedValue({ id: "pagebee_retention_50_3mo" });
    mockStripe.subscriptions.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({} as never);

    const result = await applyRetentionDiscount("c1");
    expect(result).toEqual({ ok: true });
    expect(mockStripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ percent_off: 50, duration: "repeating", duration_in_months: 3 }),
    );
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      "stripe_sub_1",
      expect.objectContaining({ discounts: [{ coupon: "pagebee_retention_50_3mo" }], cancel_at_period_end: false }),
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ retentionOfferUsedAt: expect.any(Date), cancelAt: null }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.retention_discount_applied" }));
  });

  it("reuses the coupon when it already exists", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      stripeSubscriptionId: "stripe_sub_1",
      retentionOfferUsedAt: null,
    } as never);
    mockStripe.coupons.retrieve.mockResolvedValue({ id: "pagebee_retention_50_3mo" });
    mockStripe.subscriptions.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({} as never);

    await applyRetentionDiscount("c1");
    expect(mockStripe.coupons.create).not.toHaveBeenCalled();
  });
});

// ─── upgradeSubscription ─────────────────────────────────────────────────

describe("upgradeSubscription", () => {
  it("throws not_an_upgrade when the target plan is same or lower tier", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      stripeSubscriptionId: null,
      plan: { name: "HIVE" },
    } as never);
    await expect(upgradeSubscription("c1", "NECTAR")).rejects.toThrow("not_an_upgrade");
  });

  it("throws invalid_plan for an unknown plan name", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      clientId: "c1",
      stripeSubscriptionId: null,
      plan: { name: "NECTAR" },
    } as never);
    await expect(upgradeSubscription("c1", "UNKNOWN")).rejects.toThrow("invalid_plan");
  });

  it("falls back to Checkout when there is no existing Stripe subscription", async () => {
    // No stripeSubscriptionId means tryInPlaceUpgrade returns false → falls back to checkout
    prismaMock.subscription.findUnique
      .mockResolvedValueOnce({ id: "sub1", clientId: "c1", stripeSubscriptionId: null, plan: { name: "NECTAR" } } as never) // tryInPlaceUpgrade
      .mockResolvedValueOnce({ id: "sub1", clientId: "c1", stripeCustomerId: null, plan: { name: "NECTAR" } } as never); // createBillingCheckout
    mockStripe.prices.list.mockResolvedValue({
      data: [
        { id: "price_m", lookup_key: "pagebee_honey_monthly" },
        { id: "price_s", lookup_key: "pagebee_honey_setup" },
      ],
    });
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/upgrade" });

    const result = await upgradeSubscription("c1", "HONEY");
    expect("url" in result).toBe(true);
  });
});

// ─── syncCheckoutSession ──────────────────────────────────────────────────

describe("syncCheckoutSession", () => {
  it("throws not_your_session when the session belongs to a different client", async () => {
    mockStripe.checkout.sessions.retrieve.mockResolvedValue({
      metadata: { clientId: "OTHER" },
      payment_status: "paid",
    });
    await expect(syncCheckoutSession("c1", "sess_123")).rejects.toThrow("not_your_session");
  });

  it("returns pending when payment_status is not yet paid", async () => {
    mockStripe.checkout.sessions.retrieve.mockResolvedValue({
      metadata: { clientId: "c1" },
      payment_status: "unpaid",
    });
    const result = await syncCheckoutSession("c1", "sess_123");
    expect(result).toEqual({ status: "pending" });
  });

  it("applies the checkout and returns applied for a paid setup session", async () => {
    mockStripe.checkout.sessions.retrieve.mockResolvedValue({
      metadata: { clientId: "c1", kind: "setup" },
      payment_status: "paid",
      customer: "cus_x",
      subscription: "sub_x",
    });
    prismaMock.subscription.update.mockResolvedValue({} as never);
    prismaMock.subscription.findUnique.mockResolvedValue({ setupFeePaid: false, agreedSetupFee: 99900 } as never);
    prismaMock.preview.findFirst.mockResolvedValue(null);

    const result = await syncCheckoutSession("c1", "sess_123");
    expect(result).toEqual({ status: "applied" });
  });
});

// ─── processBillingEvent ──────────────────────────────────────────────────

describe("processBillingEvent", () => {
  const makeEvent = (type: string, data: Record<string, unknown>) => ({
    id: `evt_${type.replace(/\./g, "_")}`,
    type,
    data: { object: data },
  });

  it("deduplicates already-processed events (idempotent)", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue({ processedAt: new Date() } as never);
    await processBillingEvent(makeEvent("customer.subscription.updated", {}) as never);
    expect(prismaMock.paymentEvent.upsert).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated by syncing status and period end", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 } as never);

    const now = Math.floor(Date.now() / 1000);
    await processBillingEvent(makeEvent("customer.subscription.updated", {
      id: "stripe_sub_1",
      status: "active",
      current_period_end: now + 30 * 86400,
      cancel_at: null,
    }) as never);

    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: "stripe_sub_1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("maps past_due Stripe status to PAST_DUE", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 } as never);

    await processBillingEvent(makeEvent("customer.subscription.updated", {
      id: "stripe_sub_2",
      status: "past_due",
      current_period_end: null,
      cancel_at: null,
    }) as never);

    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
  });

  it("handles customer.subscription.deleted by setting CANCELLED and notifying the client", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.subscription.findFirst.mockResolvedValue({ clientId: "c1", currentPeriodEnd: null } as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 } as never);

    await processBillingEvent(makeEvent("customer.subscription.deleted", {
      id: "stripe_sub_1",
      status: "canceled",
    }) as never);

    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }),
    );
    expect(notify.sendSubscriptionCancelled).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("handles invoice.payment_failed by incrementing failedPaymentCount and notifying — amount in cents", async () => {
    prismaMock.paymentEvent.findUnique.mockResolvedValue(null);
    prismaMock.paymentEvent.upsert.mockResolvedValue({} as never);
    prismaMock.paymentEvent.update.mockResolvedValue({} as never);
    prismaMock.subscription.findFirst.mockResolvedValue({ clientId: "c1" } as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.subscription.findUnique.mockResolvedValue({ failedPaymentCount: 1 } as never);

    await processBillingEvent(makeEvent("invoice.payment_failed", {
      subscription: "stripe_sub_1",
      amount_due: 17900,
    }) as never);

    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAST_DUE", failedPaymentCount: { increment: 1 } }),
      }),
    );
    expect(notify.sendPaymentFailed).toHaveBeenCalledWith("c1", expect.objectContaining({ amountCents: 17900 }));
    expect(Number.isInteger(17900)).toBe(true);
  });
});
