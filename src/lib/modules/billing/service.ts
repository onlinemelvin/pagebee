import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe, appBaseUrl } from "@/lib/stripe/client";
import { planByName, planRank, type PlanDef, type PlanName } from "@/lib/plans";
import { writeAudit } from "@/lib/modules/audit";
import { launchPreview } from "@/lib/modules/preview";
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
    success_url: `${returnBase}?checkout=success`,
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
export async function upgradeSubscription(
  clientId: string,
  toPlanName: string,
): Promise<{ applied: true } | { url: string }> {
  const stripe = getStripe();
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub) throw new BillingError(404, "no_subscription");

  const target = planByName(toPlanName);
  if (!target) throw new BillingError(400, "invalid_plan");
  if (planRank(target.name) <= planRank(sub.plan.name)) throw new BillingError(400, "not_an_upgrade");

  // No live Stripe subscription yet (e.g. setup fee unpaid) → Checkout collects payment + subscribes.
  if (!sub.stripeSubscriptionId) return createBillingCheckout(clientId, "upgrade", toPlanName);

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  } catch {
    return createBillingCheckout(clientId, "upgrade", toPlanName); // sub vanished on Stripe → re-subscribe
  }
  if (!isModifiable(stripeSub.status)) return createBillingCheckout(clientId, "upgrade", toPlanName);

  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) return createBillingCheckout(clientId, "upgrade", toPlanName);

  const prices = await ensurePrices(stripe, target);
  // Swap the recurring price in place; invoice the prorated difference now so the upgrade is paid for.
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
  return { applied: true };
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
      const s = event.data.object as Stripe.Checkout.Session;
      const clientId = s.metadata?.clientId;
      const kind = s.metadata?.kind;
      const toPlan = s.metadata?.toPlan;
      if (!clientId) break;

      await prisma.subscription.update({
        where: { clientId },
        data: {
          stripeCustomerId: (s.customer as string) ?? undefined,
          stripeSubscriptionId: (s.subscription as string) ?? undefined,
        },
      });

      if (kind === "upgrade" && toPlan) {
        const before = await prisma.subscription.findUnique({ where: { clientId }, select: { plan: { select: { name: true } } } });
        await switchPlan(clientId, toPlan);
        await prisma.subscription.update({ where: { clientId }, data: { status: "ACTIVE" } });
        await writeAudit({ action: "subscription.upgraded", entityType: "Client", entityId: clientId, clientId, metadata: { toPlan, via: "stripe" } });
        if (before?.plan.name && before.plan.name !== toPlan) {
          await notify.sendPlanChanged(clientId, { fromPlan: before.plan.name, toPlan });
        }
      } else {
        const sub = await prisma.subscription.update({
          where: { clientId },
          data: { setupFeePaid: true, setupFeePaidAt: new Date(), status: "ACTIVE" },
          select: { agreedSetupFee: true },
        });
        const preview = await prisma.preview.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
        if (preview && preview.status !== "LIVE") {
          await launchPreview(preview.id).catch((e) => console.error("[billing] launch failed", e));
        }
        await writeAudit({ action: "billing.setup_fee_paid", entityType: "Client", entityId: clientId, clientId });
        await notify.sendPaymentReceipt(clientId, {
          amountCents: sub.agreedSetupFee,
          description: "One-time website setup fee",
          when: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
          invoiceUrl: notify.billingUrl(),
        });
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
