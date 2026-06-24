import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe, appBaseUrl, stripeConfigured } from "@/lib/stripe/client";
import { planByName, planRank, setupFeeDelta, type PlanDef, type PlanName } from "@/lib/plans";
import { writeAudit } from "@/lib/modules/audit";
import { launchPreview } from "@/lib/modules/preview";
import { requestUpgrade } from "@/lib/modules/subscription";
import * as notify from "@/lib/modules/email/notifications";

// PageBee's own subscription billing — we charge the CLIENT for their plan (monthly) + the
// one-time setup fee, on the PLATFORM Stripe account (separate from Connect payouts). Setup-fee
// payment launches the site; Stripe webhooks keep Subscription status in sync.

export class BillingError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Find-or-create the recurring + one-time setup Prices for a plan (idempotent via lookup_key). */
async function ensurePrices(stripe: Stripe, plan: PlanDef): Promise<{ monthly: string; setup: string }> {
  const monthlyKey = `pagebee_${plan.name.toLowerCase()}_monthly`;
  const setupKey = `pagebee_${plan.name.toLowerCase()}_setup`;
  const found = await stripe.prices.list({ lookup_keys: [monthlyKey, setupKey], active: true, limit: 10 });
  let monthly = found.data.find((p) => p.lookup_key === monthlyKey)?.id;
  let setup = found.data.find((p) => p.lookup_key === setupKey)?.id;
  if (!monthly) {
    monthly = (
      await stripe.prices.create({
        lookup_key: monthlyKey,
        currency: "usd",
        unit_amount: plan.monthlyFee,
        recurring: { interval: "month" },
        product_data: { name: `PageBee ${plan.label} — monthly` },
      })
    ).id;
  }
  if (!setup) {
    const created = await stripe.prices.create({
      lookup_key: setupKey,
      currency: "usd",
      unit_amount: plan.setupFee,
      product_data: { name: `PageBee ${plan.label} — setup fee` },
    });
    setup = created.id;
    // Caption the one-time line item in Checkout ("One-time fee") to mirror the recurring
    // "Billed monthly" caption Stripe auto-adds to the monthly price.
    if (typeof created.product === "string") {
      await stripe.products.update(created.product, { description: "One-time fee" });
    }
  }
  return { monthly, setup };
}

/** Get or create the client's Stripe Customer (for our billing), cached on the Subscription. */
async function ensureCustomer(stripe: Stripe, clientId: string): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { id: true, stripeCustomerId: true } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true, ownerEmail: true } });
  const customer = await stripe.customers.create({
    email: client?.ownerEmail ?? undefined,
    name: client?.businessName ?? undefined,
    metadata: { clientId },
  });
  if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Create a Stripe Checkout session for the client's plan. `setup` starts the subscription and
 * charges the one-time setup fee (launches the site on payment); `upgrade` starts/changes the
 * subscription to `toPlan` with no setup fee.
 */
export async function createBillingCheckout(
  clientId: string,
  kind: "setup" | "upgrade",
  toPlan?: string,
): Promise<{ url: string }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub) throw new BillingError(404, "no_subscription");

  const planName = (kind === "upgrade" ? toPlan : sub.plan.name) as PlanName;
  const plan = planByName(planName);
  if (!plan) throw new BillingError(400, "invalid_plan");

  const prices = await ensurePrices(stripe, plan);
  const customer = await ensureCustomer(stripe, clientId);
  const base = appBaseUrl();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: prices.monthly, quantity: 1 }];
  if (kind === "setup") lineItems.push({ price: prices.setup, quantity: 1 }); // one-time, billed on the first invoice

  // The setup (first launch) flow returns to the dedicated launch page so the customer sees a
  // clear "your site is going live" confirmation; plan upgrades return to billing as before.
  const returnBase = kind === "setup" ? `${base}/client/launch` : `${base}/client/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: lineItems,
    // {CHECKOUT_SESSION_ID} is substituted by Stripe — lets the return page reconcile the session
    // directly (so the upgrade/launch applies even if the webhook is delayed or not configured).
    success_url: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnBase}?checkout=cancel`,
    metadata: { clientId, kind, toPlan: planName },
    subscription_data: { metadata: { clientId } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new BillingError(502, "checkout_failed");
  await writeAudit({ action: `billing.checkout_${kind}`, entityType: "Subscription", entityId: sub.id, clientId, metadata: { toPlan: planName } });
  return { url: session.url };
}

/** A Stripe subscription that can be modified in place (vs. canceled/expired). */
function isModifiable(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Upgrade an existing subscriber to a higher tier. When the client already has a live Stripe
 * subscription, we swap the recurring price IN PLACE (prorated, invoiced immediately) instead of
 * creating a second subscription — so the customer is never double-billed — and switch the plan +
 * write the `subscription.upgraded` audit synchronously (queryable trail of when it changed).
 * Falls back to Checkout when there's no usable subscription yet (collects a payment method).
 * Returns `{ applied: true }` for an in-place upgrade, or `{ url }` to redirect to Checkout.
 */
/**
 * Swap an existing subscriber to a higher tier IN PLACE (prorated, invoiced now) using their
 * already-saved card. Returns true when applied; false when there's no usable live subscription yet
 * (the caller then collects a card). Throws on a non-upgrade / invalid plan.
 */
async function tryInPlaceUpgrade(clientId: string, toPlanName: string): Promise<boolean> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub) throw new BillingError(404, "no_subscription");

  const target = planByName(toPlanName);
  if (!target) throw new BillingError(400, "invalid_plan");
  if (planRank(target.name) <= planRank(sub.plan.name)) throw new BillingError(400, "not_an_upgrade");

  if (!sub.stripeSubscriptionId) return false; // no live sub yet → needs a card

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  } catch {
    return false; // sub vanished on Stripe → re-subscribe with a card
  }
  if (!isModifiable(stripeSub.status)) return false;

  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) return false;

  const prices = await ensurePrices(stripe, target);
  // One-time, NON-REFUNDABLE setup-fee difference between tiers — queue it as an invoice item so the
  // always_invoice update below bills it now alongside the prorated monthly difference.
  const delta = setupFeeDelta(sub.plan.name, target.name);
  if (delta > 0) {
    await stripe.invoiceItems.create({
      customer: stripeSub.customer as string,
      subscription: sub.stripeSubscriptionId,
      amount: delta,
      currency: "usd",
      description: `Setup fee difference — upgrade to PageBee ${target.label}`,
    });
  }
  // Swap the recurring price in place; invoice the prorated monthly difference + setup delta now.
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: itemId, price: prices.monthly }],
    proration_behavior: "always_invoice",
    metadata: { clientId },
  });

  const fromPlan = sub.plan.name;
  await switchPlan(clientId, target.name);
  await writeAudit({
    action: "subscription.upgraded",
    entityType: "Subscription",
    entityId: sub.id,
    clientId,
    metadata: { fromPlan, toPlan: target.name, via: "stripe", inPlace: true },
  });
  return true;
}

export async function upgradeSubscription(
  clientId: string,
  toPlanName: string,
): Promise<{ applied: true } | { url: string }> {
  if (await tryInPlaceUpgrade(clientId, toPlanName)) return { applied: true };
  // No usable live subscription → hosted Checkout collects a card + subscribes (legacy path).
  return createBillingCheckout(clientId, "upgrade", toPlanName);
}

/**
 * Create a Stripe subscription in `default_incomplete` and return the first invoice's client secret,
 * so the card is collected by our OWN embedded Payment Element (white-label, PCI SAQ A) instead of
 * hosted Checkout. The setup flow adds the one-time setup fee to that first invoice. Card-only (no
 * Link/wallets) for a clean in-house look. The subscription id is intentionally NOT stored yet — it's
 * still incomplete; `reconcileFromStripe` links it once the payment activates it.
 */
async function createIncompleteSubscription(
  clientId: string,
  plan: PlanDef,
  flow: "setup" | "upgrade",
): Promise<{ clientSecret: string; amountCents: number }> {
  const stripe = getStripe();
  const prices = await ensurePrices(stripe, plan);
  const customer = await ensureCustomer(stripe, clientId);

  const subscription = await stripe.subscriptions.create({
    customer,
    items: [{ price: prices.monthly }],
    add_invoice_items: flow === "setup" ? [{ price: prices.setup }] : [],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
    expand: ["latest_invoice.confirmation_secret"],
    metadata: { clientId, kind: flow, toPlan: plan.name },
  });

  const invoice = subscription.latest_invoice as Stripe.Invoice | null;
  const clientSecret = invoice?.confirmation_secret?.client_secret;
  if (!clientSecret) throw new BillingError(502, "intent_failed");
  const amountCents = invoice?.amount_due ?? (flow === "setup" ? plan.setupFee + plan.monthlyFee : plan.monthlyFee);
  return { clientSecret, amountCents };
}

/** What a billing intent resolves to: applied instantly, captured as a request, or needs a card. */
export type BillingIntent =
  | { kind: "applied" }
  | { kind: "requested" }
  | { kind: "card"; clientSecret: string; amountCents: number; planLabel: string; flow: "setup" | "upgrade" };

/**
 * Decide how to collect payment for a setup or upgrade and, when a card is needed, hand back a
 * client secret for the embedded Payment Element. Preserves every existing fallback: test accounts /
 * no-Stripe upgrades apply-or-request as before; existing subscribers upgrade in place with no card.
 */
export async function createBillingIntent(
  client: { id: string; isTest: boolean },
  flow: "setup" | "upgrade",
  toPlan?: string,
  reason?: string,
): Promise<BillingIntent> {
  if (flow === "upgrade") {
    if (!toPlan) throw new BillingError(400, "invalid_plan");
    // Test accounts and the no-Stripe case keep their existing instant-apply / admin-request behavior.
    if (client.isTest || !stripeConfigured()) {
      const res = await requestUpgrade(client.id, toPlan, reason);
      return res.applied ? { kind: "applied" } : { kind: "requested" };
    }
    // Existing subscriber → swap in place using their saved card (no entry needed).
    if (await tryInPlaceUpgrade(client.id, toPlan)) return { kind: "applied" };
    // Not subscribed yet → collect a card via an incomplete subscription.
    const plan = planByName(toPlan);
    if (!plan) throw new BillingError(400, "invalid_plan");
    const { clientSecret, amountCents } = await createIncompleteSubscription(client.id, plan, "upgrade");
    return { kind: "card", clientSecret, amountCents, planLabel: plan.label, flow: "upgrade" };
  }

  // setup (first launch): always card via the embedded element.
  if (!stripeConfigured()) throw new BillingError(503, "stripe_not_configured");
  const sub = await prisma.subscription.findUnique({ where: { clientId: client.id }, include: { plan: true } });
  if (!sub) throw new BillingError(404, "no_subscription");
  // Pre-launch plan selection: if the client picked a different starting plan, switch to it first so
  // the setup fee + first month reflect the chosen tier.
  if (toPlan && toPlan !== sub.plan.name) {
    if (!planByName(toPlan)) throw new BillingError(400, "invalid_plan");
    await switchPlan(client.id, toPlan);
  }
  const plan = planByName((toPlan ?? sub.plan.name) as PlanName);
  if (!plan) throw new BillingError(400, "invalid_plan");
  const { clientSecret, amountCents } = await createIncompleteSubscription(client.id, plan, "setup");
  return { kind: "card", clientSecret, amountCents, planLabel: plan.label, flow: "setup" };
}

/**
 * Cancel the client's PageBee subscription. Default is `cancel_at_period_end` (graceful — they keep
 * access until the paid period ends; the `customer.subscription.deleted` webhook flips status +
 * sends the cancellation email when it actually ends). `immediate: true` ends it now. No-op-safe.
 */
export async function cancelSubscription(
  clientId: string,
  opts: { immediate?: boolean } = {},
): Promise<{ status: "scheduled" | "cancelled"; accessUntil: string | null }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { id: true, stripeSubscriptionId: true, currentPeriodEnd: true } });
  if (!sub) throw new BillingError(404, "no_subscription");
  if (!sub.stripeSubscriptionId) throw new BillingError(409, "no_active_subscription");

  if (opts.immediate) {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await writeAudit({ action: "subscription.cancelled", entityType: "Subscription", entityId: sub.id, clientId, metadata: { immediate: true } });
    return { status: "cancelled", accessUntil: null };
  }

  const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  const cancelAt = updated.cancel_at ? new Date(updated.cancel_at * 1000) : sub.currentPeriodEnd;
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAt: cancelAt ?? undefined } });
  await writeAudit({ action: "subscription.cancel_scheduled", entityType: "Subscription", entityId: sub.id, clientId });
  return { status: "scheduled", accessUntil: cancelAt?.toLocaleDateString("en-US", { dateStyle: "long" }) ?? null };
}

/** Undo a scheduled cancellation (cancel_at_period_end) before it takes effect. */
export async function reactivateSubscription(clientId: string): Promise<{ ok: true }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { id: true, stripeSubscriptionId: true } });
  if (!sub?.stripeSubscriptionId) throw new BillingError(404, "no_subscription");
  await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAt: null } });
  await writeAudit({ action: "subscription.reactivated", entityType: "Subscription", entityId: sub.id, clientId });
  return { ok: true };
}

function mapStatus(s: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIAL" | "PAYMENT_FAILED" {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIAL";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "PAYMENT_FAILED";
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED";
    default:
      return "ACTIVE";
  }
}

async function switchPlan(clientId: string, planName: string): Promise<void> {
  const plan = await prisma.plan.findUnique({ where: { name: planName as PlanName } });
  if (!plan) return;
  await prisma.subscription.update({
    where: { clientId },
    data: { planId: plan.id, agreedSetupFee: plan.setupFee, agreedMonthlyFee: plan.monthlyFee },
  });
}

/**
 * Apply a completed Checkout session: store the Stripe customer/subscription, then either switch the
 * plan (upgrade) or mark the setup fee paid + launch the site. Written to be IDEMPOTENT via DB-state
 * guards (already-on-plan / already-paid short-circuit), so it's safe to run from BOTH the webhook
 * AND the on-return reconcile (syncCheckoutSession) — whichever happens first wins, the other no-ops.
 */
async function applyCheckoutCompleted(s: Stripe.Checkout.Session): Promise<void> {
  const clientId = s.metadata?.clientId;
  if (!clientId) return;
  const kind = s.metadata?.kind;
  const toPlan = s.metadata?.toPlan;

  await prisma.subscription.update({
    where: { clientId },
    data: {
      stripeCustomerId: (s.customer as string) ?? undefined,
      stripeSubscriptionId: (s.subscription as string) ?? undefined,
    },
  });

  if (kind === "upgrade" && toPlan) {
    const before = await prisma.subscription.findUnique({ where: { clientId }, select: { plan: { select: { name: true } } } });
    if (before?.plan.name === toPlan) return; // already applied (webhook + reconcile both ran)
    await switchPlan(clientId, toPlan);
    await prisma.subscription.update({ where: { clientId }, data: { status: "ACTIVE" } });
    await writeAudit({ action: "subscription.upgraded", entityType: "Client", entityId: clientId, clientId, metadata: { toPlan, via: "stripe" } });
    if (before?.plan.name && before.plan.name !== toPlan) {
      await notify.sendPlanChanged(clientId, { fromPlan: before.plan.name, toPlan });
    }
  } else {
    const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { setupFeePaid: true, agreedSetupFee: true } });
    if (sub?.setupFeePaid) return; // already applied
    await prisma.subscription.update({ where: { clientId }, data: { setupFeePaid: true, setupFeePaidAt: new Date(), status: "ACTIVE" } });
    const preview = await prisma.preview.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
    if (preview && preview.status !== "LIVE") {
      await launchPreview(preview.id).catch((e) => console.error("[billing] launch failed", e));
    }
    await writeAudit({ action: "billing.setup_fee_paid", entityType: "Client", entityId: clientId, clientId });
    await notify.sendPaymentReceipt(clientId, {
      amountCents: sub?.agreedSetupFee ?? 0,
      description: "One-time website setup fee",
      when: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
      invoiceUrl: notify.billingUrl(),
    });
  }
}

/**
 * Reconcile a Checkout session on the customer's return from Stripe — so an upgrade/launch applies
 * even when the webhook is delayed or not configured (e.g. local dev). Retrieves the session, checks
 * it belongs to this client and is paid, then runs the same idempotent effect the webhook does.
 * Returns "applied" once done, or "pending" if payment hasn't finalized yet (caller polls).
 */
export async function syncCheckoutSession(clientId: string, sessionId: string): Promise<{ status: "applied" | "pending" }> {
  const s = await getStripe().checkout.sessions.retrieve(sessionId);
  if (s.metadata?.clientId !== clientId) throw new BillingError(403, "not_your_session");
  // Subscription checkouts are settled when payment_status is "paid" (or "no_payment_required" for
  // 100%-discounted / trial sessions). Anything else (async payment methods) → keep polling.
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return { status: "pending" };
  await applyCheckoutCompleted(s);
  return { status: "applied" };
}

/** Parse a PageBee price lookup_key ("pagebee_hive_monthly") back to its plan name ("HIVE"). */
function planNameFromLookupKey(key: string | null | undefined): string | null {
  if (!key || !key.startsWith("pagebee_")) return null;
  return key.replace(/^pagebee_/, "").replace(/_monthly$/, "").toUpperCase();
}

/**
 * Self-heal the local subscription from Stripe's truth. Stripe is authoritative for what the
 * customer is actually paying for, so when a webhook is missed (delayed, unconfigured, or it failed)
 * this reconciles our DB to match: links the live subscription, fixes the plan + status + period,
 * marks the setup fee paid + launches a pending preview, and cancels any DUPLICATE subscription a
 * "checkout instead of in-place upgrade" left behind (which would otherwise double-bill). Idempotent
 * and fail-soft — returns whether anything changed so callers can refresh.
 */
export async function reconcileFromStripe(clientId: string): Promise<{ changed: boolean }> {
  if (!stripeConfigured()) return { changed: false };
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub?.stripeCustomerId) return { changed: false };

  const list = await stripe.subscriptions.list({ customer: sub.stripeCustomerId, status: "all", limit: 20 });
  const liveStatuses = new Set(["active", "trialing", "past_due"]);
  const liveSubs = list.data.filter((s) => liveStatuses.has(s.status)).sort((a, b) => b.created - a.created);
  const live = liveSubs[0];
  if (!live) return { changed: false };

  let changed = false;

  // Cancel duplicate live subscriptions (keep the newest = the most recent purchase) so a missed
  // webhook on an upgrade can't leave the customer paying for two plans at once.
  for (const dup of liveSubs.slice(1)) {
    if (planNameFromLookupKey(dup.items.data[0]?.price?.lookup_key)) {
      await stripe.subscriptions.cancel(dup.id).catch((e) => console.error("[billing] dup cancel failed", e));
      await writeAudit({ action: "billing.duplicate_subscription_cancelled", entityType: "Subscription", entityId: sub.id, clientId, metadata: { cancelled: dup.id } });
      changed = true;
    }
  }

  // Sync the stored references + status + period end. Only include fields that ACTUALLY differ —
  // otherwise an always-present field (e.g. cancelAt) would report a change every call and a caller
  // that "redirect on changed" would loop forever.
  const data: Prisma.SubscriptionUpdateInput = {};
  if (sub.stripeSubscriptionId !== live.id) data.stripeSubscriptionId = live.id;
  const mapped = mapStatus(live.status);
  if (sub.status !== mapped) data.status = mapped;
  const periodEnd = (live as unknown as { current_period_end?: number }).current_period_end;
  if (periodEnd && sub.currentPeriodEnd?.getTime() !== periodEnd * 1000) data.currentPeriodEnd = new Date(periodEnd * 1000);
  const newCancelAt = live.cancel_at ? live.cancel_at * 1000 : null;
  if ((sub.cancelAt?.getTime() ?? null) !== newCancelAt) data.cancelAt = newCancelAt ? new Date(newCancelAt) : null;
  if (!sub.setupFeePaid) {
    data.setupFeePaid = true;
    data.setupFeePaidAt = new Date();
  }
  if (Object.keys(data).length > 0) {
    await prisma.subscription.update({ where: { clientId }, data });
    changed = true;
  }

  // Plan drift → switch to the plan the customer is actually paying for, and tell them.
  const targetName = planNameFromLookupKey(live.items.data[0]?.price?.lookup_key);
  const target = targetName ? planByName(targetName) : null;
  if (target && target.name !== sub.plan.name) {
    await switchPlan(clientId, target.name);
    await notify.sendPlanChanged(clientId, { fromPlan: sub.plan.name, toPlan: target.name });
    changed = true;
  }

  // A scheduled downgrade that has now landed (Stripe bills the lower price) → clear the pending flag.
  if (sub.pendingPlan && target?.name === sub.pendingPlan) {
    await prisma.subscription.update({ where: { clientId }, data: { pendingPlan: null } });
    changed = true;
  }

  // A paid subscription with a preview still awaiting payment → launch it now (mirrors the webhook).
  const preview = await prisma.preview.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
  if (preview && (preview.status === "APPROVED" || preview.status === "SETUP_FEE_PENDING")) {
    await launchPreview(preview.id).catch((e) => console.error("[billing] reconcile launch failed", e));
    changed = true;
  }

  if (changed) await writeAudit({ action: "billing.reconciled_from_stripe", entityType: "Subscription", entityId: sub.id, clientId, metadata: { plan: target?.name ?? sub.plan.name } });
  return { changed };
}

// ── Terms acceptance, saved card, billing history, downgrade, retention ──────────────────────────

/** Current billing-terms version recorded on acceptance. Bump when the terms copy changes. */
export const BILLING_TERMS_VERSION = "2026-06-23";

/** Record an immutable acceptance of the billing terms (incl. the non-refundable setup fee). Fail-soft. */
export async function recordBillingAgreement(args: {
  clientId: string;
  plan: string;
  amountCents: number;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.billingAgreement
    .create({
      data: {
        clientId: args.clientId,
        version: BILLING_TERMS_VERSION,
        plan: args.plan,
        amountCents: args.amountCents,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
      },
    })
    .catch((e) => console.error("[billing] agreement record failed", e));
}

/** The client's saved default card for PageBee billing (brand + last4), or null if none on file. */
export async function getSavedCard(
  clientId: string,
): Promise<{ brand: string; last4: string; expMonth: number; expYear: number } | null> {
  if (!stripeConfigured()) return null;
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { stripeCustomerId: true } });
  if (!sub?.stripeCustomerId) return null;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(sub.stripeCustomerId);
  if (customer.deleted) return null;
  const dpm = customer.invoice_settings?.default_payment_method;
  const pmId = typeof dpm === "string" ? dpm : (dpm?.id ?? null);
  if (!pmId) return null;
  const pm = await stripe.paymentMethods.retrieve(pmId);
  if (!pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
}

/** Create a SetupIntent so the client can add/replace their card via the embedded Payment Element. */
export async function createCardSetupIntent(clientId: string): Promise<{ clientSecret: string }> {
  if (!stripeConfigured()) throw new BillingError(503, "stripe_not_configured");
  const stripe = getStripe();
  const customer = await ensureCustomer(stripe, clientId);
  const si = await stripe.setupIntents.create({
    customer,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: { clientId },
  });
  if (!si.client_secret) throw new BillingError(502, "intent_failed");
  return { clientSecret: si.client_secret };
}

/** After a SetupIntent confirms, make its card the customer's + subscription's default for billing. */
export async function setDefaultCardFromSetupIntent(clientId: string, setupIntentId: string): Promise<{ ok: true }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!sub?.stripeCustomerId) throw new BillingError(404, "no_subscription");
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  if (si.metadata?.clientId !== clientId) throw new BillingError(403, "not_your_intent");
  const pmId = typeof si.payment_method === "string" ? si.payment_method : (si.payment_method?.id ?? null);
  if (!pmId) throw new BillingError(400, "no_payment_method");
  await stripe.paymentMethods.attach(pmId, { customer: sub.stripeCustomerId }).catch(() => {});
  await stripe.customers.update(sub.stripeCustomerId, { invoice_settings: { default_payment_method: pmId } });
  if (sub.stripeSubscriptionId) {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { default_payment_method: pmId }).catch(() => {});
  }
  await writeAudit({ action: "billing.card_updated", entityType: "Client", entityId: clientId, clientId });
  return { ok: true };
}

/** PageBee billing history (the platform's invoices to this client) for the billing screen. */
export async function listBillingInvoices(clientId: string): Promise<
  Array<{ id: string; date: string; amountCents: number; status: string; url: string | null; pdf: string | null; description: string }>
> {
  if (!stripeConfigured()) return [];
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { stripeCustomerId: true } });
  if (!sub?.stripeCustomerId) return [];
  const stripe = getStripe();
  const list = await stripe.invoices.list({ customer: sub.stripeCustomerId, limit: 12 });
  return list.data.map((inv) => ({
    id: inv.id ?? "",
    date: new Date((inv.created ?? 0) * 1000).toLocaleDateString("en-US", { dateStyle: "medium" }),
    amountCents: inv.amount_paid || inv.amount_due || inv.total || 0,
    status: inv.status ?? "open",
    url: inv.hosted_invoice_url ?? null,
    pdf: inv.invoice_pdf ?? null,
    description: inv.lines.data[0]?.description ?? "PageBee subscription",
  }));
}

/**
 * Schedule a DOWNGRADE to a lower tier at the end of the current billing period (no refund — the
 * setup fee is non-refundable and the current month is already paid). A Stripe subscription schedule
 * keeps the current price until period end (phase 1), then starts the lower price (phase 2); the
 * client keeps current features until it lands and reconcile flips the local plan. Also DROPS any
 * retention discount — downgrading forfeits it.
 */
export async function scheduleDowngrade(clientId: string, toPlanName: string): Promise<{ effectiveAt: string | null }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub) throw new BillingError(404, "no_subscription");
  if (!sub.stripeSubscriptionId) throw new BillingError(409, "no_active_subscription");
  const target = planByName(toPlanName);
  if (!target) throw new BillingError(400, "invalid_plan");
  if (planRank(target.name) >= planRank(sub.plan.name)) throw new BillingError(400, "not_a_downgrade");

  const prices = await ensurePrices(stripe, target);

  // Downgrading forfeits the retention discount.
  await stripe.subscriptions.update(sub.stripeSubscriptionId, { discounts: [] }).catch(() => {});

  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.stripeSubscriptionId });
  const p0 = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: p0.items.map((i) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
        start_date: p0.start_date,
        end_date: p0.end_date,
      },
      { items: [{ price: prices.monthly, quantity: 1 }] },
    ],
  });

  const effectiveAt = sub.currentPeriodEnd ?? (p0.end_date ? new Date(p0.end_date * 1000) : null);
  await prisma.subscription.update({ where: { clientId }, data: { pendingPlan: target.name } });
  await writeAudit({ action: "subscription.downgrade_scheduled", entityType: "Subscription", entityId: sub.id, clientId, metadata: { toPlan: target.name } });
  return { effectiveAt: effectiveAt?.toLocaleDateString("en-US", { dateStyle: "long" }) ?? null };
}

/** Whether the client is still eligible for the one-time retention offer (never claimed). */
export async function retentionOfferAvailable(clientId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { clientId }, select: { retentionOfferUsedAt: true } });
  return Boolean(sub) && !sub?.retentionOfferUsedAt;
}

/**
 * The one-time cancel-flow retention offer: 50% off the CURRENT plan for 3 billing cycles. Halts any
 * scheduled cancellation (the client stays), applies the coupon, and marks it used so it's never
 * offered again. Forfeited if the client later downgrades.
 */
export async function applyRetentionDiscount(clientId: string): Promise<{ ok: true }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { id: true, stripeSubscriptionId: true, retentionOfferUsedAt: true },
  });
  if (!sub?.stripeSubscriptionId) throw new BillingError(409, "no_active_subscription");
  if (sub.retentionOfferUsedAt) throw new BillingError(409, "offer_already_used");

  const couponId = "pagebee_retention_50_3mo";
  try {
    await stripe.coupons.retrieve(couponId);
  } catch {
    await stripe.coupons.create({
      id: couponId,
      percent_off: 50,
      duration: "repeating",
      duration_in_months: 3,
      name: "PageBee loyalty — 50% off for 3 months",
    });
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    discounts: [{ coupon: couponId }],
    cancel_at_period_end: false,
  });
  await prisma.subscription.update({ where: { clientId }, data: { retentionOfferUsedAt: new Date(), cancelAt: null } });
  await writeAudit({ action: "subscription.retention_discount_applied", entityType: "Subscription", entityId: sub.id, clientId });
  return { ok: true };
}

/** Process a verified Stripe billing webhook event. Idempotent — dedupes redeliveries by event id
 *  (same PaymentEvent ledger the Connect webhook uses) so a retried setup-fee event can't double-launch. */
export async function processBillingEvent(event: Stripe.Event): Promise<void> {
  const existing = await prisma.paymentEvent.findUnique({ where: { externalId: event.id }, select: { processedAt: true } });
  if (existing?.processedAt) return;
  await prisma.paymentEvent.upsert({
    where: { externalId: event.id },
    create: { externalId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue },
    update: {},
  });

  switch (event.type) {
    case "checkout.session.completed": {
      await applyCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "invoice.paid": {
      // First payment of an embedded-element subscription (no Checkout session fires). Reconcile from
      // Stripe's truth: links the now-active subscription, marks the setup fee paid + launches the
      // site, or applies an upgrade's plan switch. Gated to the initial invoice so renewals are no-ops.
      const inv = event.data.object as Stripe.Invoice;
      if (inv.billing_reason !== "subscription_create") break;
      const customerId = typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null);
      if (customerId) {
        const row = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { clientId: true } });
        if (row) await reconcileFromStripe(row.clientId).catch((e) => console.error("[billing] invoice.paid reconcile failed", e));
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: {
          status: mapStatus(sub.status),
          ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
          ...(sub.cancel_at ? { cancelAt: new Date(sub.cancel_at * 1000) } : {}),
        },
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const row = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id }, select: { clientId: true, currentPeriodEnd: true } });
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (row) {
        await notify.sendSubscriptionCancelled(row.clientId, {
          accessUntil: row.currentPeriodEnd?.toLocaleDateString("en-US", { dateStyle: "long" }),
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const subId = (inv as unknown as { subscription?: string }).subscription;
      if (subId) {
        const row = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId }, select: { clientId: true } });
        const updated = await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "PAST_DUE", failedPaymentCount: { increment: 1 } },
        });
        if (row && updated.count) {
          const fresh = await prisma.subscription.findUnique({ where: { clientId: row.clientId }, select: { failedPaymentCount: true } });
          await notify.sendPaymentFailed(row.clientId, {
            amountCents: inv.amount_due ?? 0,
            attempt: fresh?.failedPaymentCount ?? 1,
          });
        }
      }
      break;
    }
  }

  await prisma.paymentEvent.update({ where: { externalId: event.id }, data: { processedAt: new Date() } });
}
