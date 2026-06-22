import crypto from "node:crypto";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { getStripe, stripeConfigured, connectClientId, appBaseUrl, applicationFee, PLATFORM_FEE_BPS } from "@/lib/stripe/client";
import { signingSecret } from "@/lib/secret";
import { sendEmail } from "@/lib/modules/email";
import { createNotification, isGroupEmailAllowed } from "@/lib/modules/notification";
import { formatMoney } from "@/lib/modules/finance/money";

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

/**
 * Owner-initiated standalone payment link for an ad-hoc amount (not tied to an
 * invoice) — e.g. a deposit or quick charge the owner texts/emails a customer.
 * A Connect destination charge with the platform fee, same as invoice checkout.
 * Owner-gated at the route (deliberately NOT a public endpoint — a login-less
 * "mint an arbitrary charge URL" surface would be an abuse vector).
 */
export async function createPaymentLink(
  clientId: string,
  input: { amountCents: number; description: string; currency?: string; customerEmail?: string },
): Promise<{ url: string }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const amount = Math.round(input.amountCents);
  if (!Number.isInteger(amount) || amount < 50) throw new PaymentError(400, "invalid_amount");

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true, paymentsEnabled: true } });
  const account = client?.stripeConnectAccountId;
  if (!account || !client.paymentsEnabled) throw new PaymentError(409, "payments_unavailable");

  const currency = (input.currency ?? "usd").toLowerCase();
  const base = appBaseUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      { price_data: { currency, product_data: { name: input.description.slice(0, 200) }, unit_amount: amount }, quantity: 1 },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFee(amount),
      transfer_data: { destination: account },
    },
    customer_email: input.customerEmail || undefined,
    success_url: `${base}/?payment=success`,
    cancel_url: `${base}/?payment=cancelled`,
    metadata: { clientId, kind: "payment_link" },
  });
  if (!session.url) throw new PaymentError(502, "checkout_failed");
  await writeAudit({ action: "payments.payment_link_created", entityType: "Client", entityId: clientId, clientId, metadata: { amount, currency } });
  return { url: session.url };
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
    case "payment_intent.succeeded": {
      // Embedded (Payment Element) invoice payments confirm client-side and land here. Idempotent
      // via applyPayment's payment-intent dedupe, so this never double-counts a checkout-session pay.
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      if (invoiceId) {
        await applyPayment(invoiceId, pi.amount_received || pi.amount, {
          paymentIntentId: pi.id,
          chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null),
        });
      }
      break;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await onDisputeOpened(dispute);
      break;
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      await onDisputeClosed(dispute);
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
      const payment = await prisma.payment.findFirst({ where: { stripeChargeId: charge.id }, select: { id: true, invoiceId: true, amount: true } });
      if (payment) {
        // charge.amount_refunded is the CUMULATIVE amount refunded on this charge.
        const cumulativeRefunded = charge.amount_refunded ?? 0;
        const fullyRefunded = charge.refunded || cumulativeRefunded >= payment.amount;
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });

        // Reconcile Refund rows to the cumulative truth. Settle any PENDING
        // owner-initiated refund, then add a row for any not-yet-recorded delta
        // (e.g. a refund issued from the Stripe dashboard) — never double-count.
        const existing = await prisma.refund.findMany({ where: { paymentId: payment.id }, select: { amount: true } });
        const recorded = existing.reduce((s, r) => s + r.amount, 0);
        await prisma.refund.updateMany({ where: { paymentId: payment.id, status: "PENDING" }, data: { status: "SUCCEEDED" } });
        if (cumulativeRefunded > recorded) {
          await prisma.refund.create({
            data: { paymentId: payment.id, invoiceId: payment.invoiceId, amount: cumulativeRefunded - recorded, status: "SUCCEEDED", reason: "stripe_webhook" },
          });
        }

        if (payment.invoiceId) {
          // Recompute net paid from the ledger: sum(payments) - sum(refunds), clamped to [0, total].
          const [inv, paidAgg, refundAgg] = await Promise.all([
            prisma.invoice.findUnique({ where: { id: payment.invoiceId }, select: { total: true } }),
            prisma.payment.aggregate({ where: { invoiceId: payment.invoiceId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { amount: true } }),
            prisma.refund.aggregate({ where: { invoiceId: payment.invoiceId }, _sum: { amount: true } }),
          ]);
          const net = Math.max(0, (paidAgg._sum.amount ?? 0) - (refundAgg._sum.amount ?? 0));
          const status = net <= 0 ? "REFUNDED" : net >= (inv?.total ?? 0) ? "PAID" : "PARTIALLY_PAID";
          await prisma.invoice.update({ where: { id: payment.invoiceId }, data: { amountPaid: net, status } }).catch(() => {});
        }
      }
      break;
    }
    default:
      break;
  }
  await prisma.paymentEvent.update({ where: { externalId: event.id }, data: { processedAt: new Date() } });
}

/**
 * Owner-initiated refund (full or partial). Requires the original Stripe payment.
 *
 * Connect refund policy (destination charges): we ALWAYS `reverse_transfer` so the refund is funded
 * from the merchant's own balance (it's their customer, their sale) rather than the platform eating
 * it. Whether the platform's application fee is also returned to the merchant is a platform policy
 * knob — `STRIPE_REFUND_APPLICATION_FEE="true"` refunds the proportional fee too; default keeps it
 * (we did the processing work). `refund_application_fee` requires `reverse_transfer`.
 */
export async function refundPayment(clientId: string, paymentId: string, amount?: number): Promise<{ id: string }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, clientId }, select: { id: true, amount: true, stripePaymentIntentId: true, invoiceId: true } });
  if (!payment || !payment.stripePaymentIntentId) throw new PaymentError(404, "not_found");
  const refundFee = process.env.STRIPE_REFUND_APPLICATION_FEE === "true";
  const refund = await getStripe().refunds.create({
    payment_intent: payment.stripePaymentIntentId,
    amount: amount && amount < payment.amount ? amount : undefined,
    reverse_transfer: true,
    refund_application_fee: refundFee,
  });
  const created = await prisma.refund.create({
    data: { paymentId: payment.id, invoiceId: payment.invoiceId, amount: amount ?? payment.amount, status: "PENDING", stripeRefundId: refund.id },
  });
  await writeAudit({ action: "payments.refund_created", entityType: "Payment", entityId: payment.id, clientId, metadata: { amount: amount ?? payment.amount } });
  return { id: created.id };
}

// ── Disputes / chargebacks ─────────────────────────────────────────────────────
// With Custom connected accounts the PLATFORM is liable for disputes, so surface every one to the
// owner immediately and track liability on the Payment row. Evidence submission is handled in the
// Stripe dashboard for now (a future in-app evidence flow can call disputes.update).

async function disputeOwnerEmail(clientId: string, subject: string, html: string): Promise<void> {
  if (!(await isGroupEmailAllowed(clientId, "billing"))) return;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerEmail: true } });
  const to = client?.ownerEmail || process.env.RESEND_FROM_EMAIL;
  if (to) await sendEmail({ to, subject, html });
}

async function onDisputeOpened(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const payment = await prisma.payment.findFirst({ where: { stripeChargeId: chargeId }, select: { id: true, clientId: true, amount: true, currency: true, invoiceId: true } });
  if (!payment) return;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: `dispute:${dispute.reason}` } });
  await writeAudit({ action: "payments.dispute_opened", entityType: "Payment", entityId: payment.id, clientId: payment.clientId, metadata: { amount: dispute.amount, reason: dispute.reason } });

  const due = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("en-US", { dateStyle: "long" }) : null;
  await createNotification({
    clientId: payment.clientId,
    type: "payment.disputed",
    body: `A customer disputed a ${formatMoney(dispute.amount)} card payment (${dispute.reason.replace(/_/g, " ")}).${due ? ` Respond by ${due}.` : ""}`,
  });
  await disputeOwnerEmail(
    payment.clientId,
    `Action needed: a ${formatMoney(dispute.amount)} payment was disputed`,
    `<h2>A payment was disputed</h2>
     <p>A customer has disputed a card payment of <strong>${formatMoney(dispute.amount)}</strong> (reason: ${dispute.reason.replace(/_/g, " ")}).</p>
     ${due ? `<p><strong>Evidence is due by ${due}.</strong></p>` : ""}
     <p>The disputed amount is held by the card network until the dispute resolves. We'll guide you through responding.</p>`,
  );
}

async function onDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const payment = await prisma.payment.findFirst({ where: { stripeChargeId: chargeId }, select: { id: true, clientId: true, amount: true } });
  if (!payment) return;
  const won = dispute.status === "won";
  // Won → the charge stands (back to SUCCEEDED). Lost → funds were withdrawn; leave DISPUTED as the
  // terminal liability marker (a chargeback is not a refund, so we don't touch the refund ledger).
  await prisma.payment.update({ where: { id: payment.id }, data: { status: won ? "SUCCEEDED" : "DISPUTED" } });
  await writeAudit({ action: won ? "payments.dispute_won" : "payments.dispute_lost", entityType: "Payment", entityId: payment.id, clientId: payment.clientId });
  await createNotification({
    clientId: payment.clientId,
    type: won ? "payment.dispute_won" : "payment.dispute_lost",
    body: won
      ? `You won the dispute on a ${formatMoney(dispute.amount)} payment — the funds are yours.`
      : `A ${formatMoney(dispute.amount)} dispute was lost; the amount was charged back.`,
  });
}

// ── White-label card entry: embedded invoice payment (Payment Element) ──────────
// An alternative to the hosted-Checkout `createInvoiceCheckout`: returns a PaymentIntent client
// secret the public pay page confirms inline with Stripe Elements, so the customer never leaves the
// branded page. Same destination-charge + application-fee shape as Checkout; the webhook
// (payment_intent.succeeded) records the Payment. Checkout stays available as a fallback.
export async function createInvoicePaymentIntent(
  token: string,
  opts: { deposit?: boolean } = {},
): Promise<{ clientSecret: string; amount: number; currency: string }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const inv = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: { client: { select: { id: true, stripeConnectAccountId: true, paymentsEnabled: true } }, customer: { select: { email: true } } },
  });
  if (!inv || inv.docType !== "INVOICE") throw new PaymentError(404, "not_found");
  const account = inv.client.stripeConnectAccountId;
  if (!account || !inv.client.paymentsEnabled) throw new PaymentError(409, "payments_unavailable");

  const balance = inv.total - inv.amountPaid;
  const amount = opts.deposit && inv.depositAmount > 0 && inv.amountPaid === 0 ? Math.min(inv.depositAmount, balance) : balance;
  if (amount <= 0) throw new PaymentError(409, "nothing_due");

  const pi = await getStripe().paymentIntents.create({
    amount,
    currency: inv.currency,
    application_fee_amount: applicationFee(amount),
    transfer_data: { destination: account },
    automatic_payment_methods: { enabled: true },
    receipt_email: inv.customer?.email ?? undefined,
    metadata: { invoiceId: inv.id, clientId: inv.client.id, deposit: opts.deposit ? "1" : "0" },
  });
  if (!pi.client_secret) throw new PaymentError(502, "intent_failed");
  return { clientSecret: pi.client_secret, amount, currency: inv.currency };
}

// ── White-label card-on-file authorization (SetupIntent) for AUTO_CHARGE plans ──
// The customer authorizes recurring billing on a branded page; we save the PLATFORM Customer +
// PaymentMethod against the plan (destination charges run on the platform) plus the mandate they
// accepted. The owner mints the link; the customer never hands their card to the business.

/** Owner action: (re)issue the public authorization link for an AUTO_CHARGE plan. */
export async function mintPlanAuthToken(clientId: string, planId: string): Promise<{ url: string; token: string }> {
  const plan = await prisma.recurringPlan.findFirst({ where: { id: planId, clientId }, select: { id: true, authToken: true } });
  if (!plan) throw new PaymentError(404, "not_found");
  const token = plan.authToken ?? `rcp_${crypto.randomBytes(24).toString("base64url")}`;
  if (!plan.authToken) await prisma.recurringPlan.update({ where: { id: planId }, data: { authToken: token } });
  return { token, url: `${appBaseUrl()}/authorize/${token}` };
}

export interface PlanAuthContext {
  businessName: string;
  customerName: string | null;
  amountPerCycle: number;
  currency: string;
  interval: string;
  authorized: boolean;
  paymentsAvailable: boolean;
}

/** Public: details the authorization page renders (no secrets). */
export async function getPlanAuthContext(token: string): Promise<PlanAuthContext | null> {
  const plan = await prisma.recurringPlan.findUnique({
    where: { authToken: token },
    select: {
      lineItems: true, currency: true, interval: true, stripePaymentMethodId: true,
      customer: { select: { name: true } },
      client: { select: { businessName: true, stripeConnectAccountId: true, paymentsEnabled: true } },
    },
  });
  if (!plan) return null;
  const lines = Array.isArray(plan.lineItems) ? (plan.lineItems as Array<{ quantity?: number; unitAmount?: number }>) : [];
  const amountPerCycle = lines.reduce((s, l) => s + Number(l.quantity ?? 1) * Number(l.unitAmount ?? 0), 0);
  return {
    businessName: plan.client.businessName,
    customerName: plan.customer?.name ?? null,
    amountPerCycle,
    currency: plan.currency,
    interval: plan.interval,
    authorized: Boolean(plan.stripePaymentMethodId),
    paymentsAvailable: Boolean(plan.client.stripeConnectAccountId && plan.client.paymentsEnabled),
  };
}

/** Public: create the SetupIntent the authorization page confirms (saves a card for off-session use). */
export async function createPlanSetupIntent(token: string): Promise<{ clientSecret: string }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const plan = await prisma.recurringPlan.findUnique({
    where: { authToken: token },
    select: { id: true, clientId: true, stripeCustomerId: true, customer: { select: { name: true, email: true } } },
  });
  if (!plan) throw new PaymentError(404, "not_found");
  const stripe = getStripe();

  // One platform Customer per recurring plan's end-customer (cached on the plan).
  let customerId = plan.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: plan.customer?.name ?? undefined,
      email: plan.customer?.email ?? undefined,
      metadata: { clientId: plan.clientId, recurringPlanId: plan.id },
    });
    customerId = customer.id;
    await prisma.recurringPlan.update({ where: { id: plan.id }, data: { stripeCustomerId: customerId } });
  }

  const si = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    automatic_payment_methods: { enabled: true },
    metadata: { recurringPlanId: plan.id, clientId: plan.clientId },
  });
  if (!si.client_secret) throw new PaymentError(502, "intent_failed");
  return { clientSecret: si.client_secret };
}

/** Public: after the SetupIntent confirms, persist the saved card + the mandate the customer accepted. */
export async function savePlanCard(
  token: string,
  args: { setupIntentId: string; mandateText: string; ip: string | null },
): Promise<{ ok: true }> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const plan = await prisma.recurringPlan.findUnique({ where: { authToken: token }, select: { id: true, clientId: true, stripeCustomerId: true } });
  if (!plan) throw new PaymentError(404, "not_found");

  const si = await getStripe().setupIntents.retrieve(args.setupIntentId);
  if (si.status !== "succeeded") throw new PaymentError(409, "setup_incomplete");
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
  // Bind the SetupIntent to THIS plan (it carries our metadata) so a token can't graft a card meant
  // for a different plan/customer.
  if (!pm || !customer || si.metadata?.recurringPlanId !== plan.id || customer !== plan.stripeCustomerId) {
    throw new PaymentError(409, "mismatch");
  }

  await prisma.recurringPlan.update({
    where: { id: plan.id },
    data: {
      stripePaymentMethodId: pm,
      mode: "AUTO_CHARGE", // a saved card means this plan now auto-charges
      mandateAcceptedAt: new Date(),
      mandateText: args.mandateText.slice(0, 2000),
      mandateIp: args.ip,
    },
  });
  await writeAudit({ action: "payments.card_authorized", entityType: "RecurringPlan", entityId: plan.id, clientId: plan.clientId });
  // Tell the owner their customer is now set up for automatic billing.
  await createNotification({ clientId: plan.clientId, type: "recurring.authorized", body: "A customer authorized automatic card payments." });
  return { ok: true };
}
