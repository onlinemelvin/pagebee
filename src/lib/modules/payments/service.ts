import crypto from "node:crypto";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { getStripe, stripeConfigured, connectClientId, appBaseUrl, applicationFee, PLATFORM_FEE_BPS } from "@/lib/stripe/client";
import { signingSecret } from "@/lib/secret";

export class PaymentError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export type StripeMode = "PLATFORM" | "BYO";

export interface PaymentStatus {
  configured: boolean; // platform has Stripe keys
  mode: StripeMode;
  connected: boolean; // a connected account exists
  chargesEnabled: boolean;
  accountId: string | null;
  feeBps: number;
}

export async function getPaymentStatus(clientId: string): Promise<PaymentStatus> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true, paymentsEnabled: true } });
  const settings = await getFinanceSettings(clientId);
  return {
    configured: stripeConfigured(),
    mode: settings.stripeMode,
    connected: Boolean(client?.stripeConnectAccountId),
    chargesEnabled: Boolean(client?.paymentsEnabled),
    accountId: client?.stripeConnectAccountId ?? null,
    feeBps: PLATFORM_FEE_BPS,
  };
}

/** Tier gate: PageBee Pay is an Automate-tier capability. */
async function assertTier(clientId: string): Promise<void> {
  const planClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { subscription: { select: { plan: { select: { featureFlags: true } } } } },
  });
  const flags = (planClient?.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  if (!(flags.invoices ?? flags.payments)) throw new PaymentError(403, "tier_required");
}

function connectStateSecret(): string {
  return signingSecret("STRIPE_CONNECT_STATE_SECRET", "SUPABASE_SERVICE_ROLE_KEY");
}

/** Signed, single-use-ish OAuth `state` bound to a client (CSRF + tamper protection). */
function signConnectState(clientId: string): string {
  const nonce = crypto.randomBytes(9).toString("base64url");
  const sig = crypto.createHmac("sha256", connectStateSecret()).update(`${clientId}.${nonce}`).digest("hex").slice(0, 32);
  return `${clientId}.${nonce}.${sig}`;
}

/** True only if `state` is a valid signed state for `clientId` (the authenticated session client). */
export function verifyConnectState(state: string, clientId: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [cid, nonce, sig] = parts;
  if (cid !== clientId) return false;
  const expected = crypto.createHmac("sha256", connectStateSecret()).update(`${cid}.${nonce}`).digest("hex").slice(0, 32);
  try {
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * BYO ("bring your own Stripe") — OAuth connect to the client's existing account. The white-label
 * "use ours" path is the Custom-account flow in onboarding.ts (submitOnboarding), not here.
 */
export async function startConnect(clientId: string): Promise<string> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  await assertTier(clientId);
  await saveFinanceSettings(clientId, { ...(await getFinanceSettings(clientId)), stripeMode: "BYO" });
  const cid = connectClientId();
  if (!cid) throw new PaymentError(503, "connect_client_id_missing");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cid,
    scope: "read_write",
    redirect_uri: `${appBaseUrl()}/api/v1/client/payments/connect/oauth`,
    state: signConnectState(clientId),
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * BYO OAuth callback — exchange the code for the connected account id and attach it to `clientId`.
 * `clientId` MUST be the authenticated session client (the callback verifies the signed `state`
 * matches it), never a value taken straight from the request — otherwise an attacker could link
 * their Stripe account to someone else's tenant and divert that tenant's payments.
 */
export async function completeOAuth(clientId: string, code: string): Promise<void> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const stripe = getStripe();
  const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
  const account = token.stripe_user_id;
  if (!account) throw new PaymentError(400, "oauth_failed");
  await prisma.client.update({ where: { id: clientId }, data: { stripeConnectAccountId: account } });
  await refreshAccountStatus(clientId);
  await writeAudit({ action: "payments.byo_connected", entityType: "Client", entityId: clientId, clientId });
}

/** Pull the latest account flags from Stripe and persist paymentsEnabled. */
export async function refreshAccountStatus(clientId: string): Promise<boolean> {
  if (!stripeConfigured()) return false;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true } });
  if (!client?.stripeConnectAccountId) return false;
  const acct = await getStripe().accounts.retrieve(client.stripeConnectAccountId);
  const enabled = Boolean(acct.charges_enabled && acct.payouts_enabled);
  await prisma.client.update({ where: { id: clientId }, data: { paymentsEnabled: enabled } });
  return enabled;
}

/** Create a Stripe Checkout session for a customer to pay an invoice (destination charge + fee). */
export async function createInvoiceCheckout(token: string, opts: { deposit?: boolean } = {}): Promise<string> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const inv = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: { client: { select: { id: true, stripeConnectAccountId: true, paymentsEnabled: true, businessName: true } }, customer: { select: { email: true } } },
  });
  if (!inv || inv.docType !== "INVOICE") throw new PaymentError(404, "not_found");
  const account = inv.client.stripeConnectAccountId;
  if (!account || !inv.client.paymentsEnabled) throw new PaymentError(409, "payments_unavailable");

  const balance = inv.total - inv.amountPaid;
  const amount = opts.deposit && inv.depositAmount > 0 && inv.amountPaid === 0 ? Math.min(inv.depositAmount, balance) : balance;
  if (amount <= 0) throw new PaymentError(409, "nothing_due");

  const base = appBaseUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: inv.currency,
          product_data: { name: `Invoice ${inv.number}${opts.deposit ? " (deposit)" : ""}` },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFee(amount),
      transfer_data: { destination: account },
    },
    customer_email: inv.customer?.email ?? undefined,
    success_url: `${base}/d/${token}?paid=1`,
    cancel_url: `${base}/d/${token}`,
    metadata: { invoiceId: inv.id, clientId: inv.client.id, deposit: opts.deposit ? "1" : "0" },
  });
  if (!session.url) throw new PaymentError(502, "checkout_failed");
  return session.url;
}

/** Apply a successful charge to an invoice (idempotent on the payment intent). */
async function applyPayment(invoiceId: string, amount: number, refs: { paymentIntentId?: string | null; chargeId?: string | null; receiptUrl?: string | null }) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, clientId: true, customerId: true, total: true, amountPaid: true, currency: true, number: true, taxCalculationId: true } });
  if (!inv) return;
  if (refs.paymentIntentId) {
    const dupe = await prisma.payment.findUnique({ where: { stripePaymentIntentId: refs.paymentIntentId } }).catch(() => null);
    if (dupe) return; // already recorded
  }
  await prisma.payment.create({
    data: {
      clientId: inv.clientId,
      customerId: inv.customerId,
      invoiceId: inv.id,
      provider: "STRIPE",
      status: "SUCCEEDED",
      amount,
      currency: inv.currency,
      stripePaymentIntentId: refs.paymentIntentId ?? null,
      stripeChargeId: refs.chargeId ?? null,
      receiptUrl: refs.receiptUrl ?? null,
      paidAt: new Date(),
    },
  });
  const amountPaid = Math.min(inv.total, inv.amountPaid + amount);
  const paid = amountPaid >= inv.total;
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { amountPaid, status: paid ? "PAID" : "PARTIALLY_PAID", paidAt: paid ? new Date() : undefined },
  });
  // File the calculated tax as a Stripe Tax transaction (automatic tax) once fully paid.
  if (paid && inv.taxCalculationId) {
    const { recordTaxTransaction } = await import("./tax");
    await recordTaxTransaction(inv.clientId, inv.taxCalculationId, inv.number).catch(() => {});
  }
  await writeAudit({ action: "payments.charge_succeeded", entityType: "Invoice", entityId: inv.id, clientId: inv.clientId, metadata: { amount } });
}

/**
 * Attempt an off-session charge for a recurring AUTO_CHARGE plan, using a card saved on file. Best-
 * effort and fully guarded: returns { charged:false } (so the caller falls back to emailing a pay
 * link) when Stripe isn't configured, the account can't accept payments, or the charge fails. Only
 * runs when a saved customer + payment method are supplied.
 */
export async function chargeInvoiceOffSession(
  invoiceId: string,
  opts: { stripeCustomerId: string; paymentMethodId: string },
): Promise<{ charged: boolean; reason?: string }> {
  if (!stripeConfigured()) return { charged: false, reason: "stripe_not_configured" };
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, amountPaid: true, currency: true, client: { select: { stripeConnectAccountId: true, paymentsEnabled: true } } },
  });
  if (!inv) return { charged: false, reason: "not_found" };
  const account = inv.client.stripeConnectAccountId;
  const amount = inv.total - inv.amountPaid;
  if (!account || !inv.client.paymentsEnabled) return { charged: false, reason: "payments_unavailable" };
  if (amount <= 0) return { charged: false, reason: "nothing_due" };
  try {
    const pi = await getStripe().paymentIntents.create({
      amount,
      currency: inv.currency,
      customer: opts.stripeCustomerId,
      payment_method: opts.paymentMethodId,
      off_session: true,
      confirm: true,
      application_fee_amount: applicationFee(amount),
      transfer_data: { destination: account },
    });
    if (pi.status === "succeeded") {
      await applyPayment(inv.id, amount, { paymentIntentId: pi.id, chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null });
      return { charged: true };
    }
    return { charged: false, reason: pi.status };
  } catch (e) {
    return { charged: false, reason: e instanceof Error ? e.message : "charge_failed" };
  }
}

/** Process a verified Stripe webhook event (idempotent via PaymentEvent). */
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const existing = await prisma.paymentEvent.findUnique({ where: { externalId: event.id }, select: { processedAt: true } });
  if (existing?.processedAt) return;
  await prisma.paymentEvent.upsert({
    where: { externalId: event.id },
    create: { externalId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue },
    update: {},
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const invoiceId = s.metadata?.invoiceId;
      if (invoiceId && s.payment_status === "paid") {
        await applyPayment(invoiceId, s.amount_total ?? 0, {
          paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        });
      }
      break;
    }
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      await prisma.client.updateMany({
        where: { stripeConnectAccountId: acct.id },
        data: { paymentsEnabled: Boolean(acct.charges_enabled && acct.payouts_enabled) },
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const payment = await prisma.payment.findFirst({ where: { stripeChargeId: charge.id }, select: { id: true, invoiceId: true } });
      if (payment) {
        const refundedTotal = charge.amount_refunded ?? 0;
        await prisma.payment.update({ where: { id: payment.id }, data: { status: charge.refunded ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
        if (payment.invoiceId) {
          await prisma.invoice.update({ where: { id: payment.invoiceId }, data: { status: "REFUNDED", amountPaid: { decrement: 0 } } }).catch(() => {});
        }
        void refundedTotal;
      }
      break;
    }
    default:
      break;
  }
  await prisma.paymentEvent.update({ where: { externalId: event.id }, data: { processedAt: new Date() } });
}

/** Owner-initiated refund (full or partial). Requires the original Stripe payment. */
export async function refundPayment(clientId: string, paymentId: string, amount?: number): Promise<{ id: string }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, clientId }, select: { id: true, amount: true, stripePaymentIntentId: true, invoiceId: true } });
  if (!payment || !payment.stripePaymentIntentId) throw new PaymentError(404, "not_found");
  const refund = await getStripe().refunds.create({
    payment_intent: payment.stripePaymentIntentId,
    amount: amount && amount < payment.amount ? amount : undefined,
  });
  const created = await prisma.refund.create({
    data: { paymentId: payment.id, invoiceId: payment.invoiceId, amount: amount ?? payment.amount, status: "PENDING", stripeRefundId: refund.id },
  });
  await writeAudit({ action: "payments.refund_created", entityType: "Payment", entityId: payment.id, clientId, metadata: { amount: amount ?? payment.amount } });
  return { id: created.id };
}
