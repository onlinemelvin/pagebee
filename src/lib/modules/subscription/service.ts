import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { planByName, type PlanDef } from "@/lib/plans";

export class SubscriptionError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export interface UpdateQuota {
  allowance: number; // monthly minor updates the plan includes
  used: number; // consumed this period
  remaining: number;
  planName: string;
}

/** Start of the current calendar month (UTC). TODO: switch to Subscription.currentPeriodStart
 *  windows once Stripe billing periods are wired (ONBOARDING §18). */
function periodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** A client's monthly minor-update allowance and how much is left this period. */
export async function getUpdateQuota(clientId: string): Promise<UpdateQuota> {
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { plan: { select: { name: true, monthlyUpdates: true } } },
  });
  const allowance = sub?.plan.monthlyUpdates ?? 1;
  const used = await prisma.websiteUpdate.count({
    where: { clientId, status: { not: "rejected" }, createdAt: { gte: periodStart() } },
  });
  return { allowance, used, remaining: Math.max(0, allowance - used), planName: sub?.plan.name ?? "LAUNCH" };
}

/** Switch a client's subscription to a target plan (and its agreed fees). */
async function applyPlanChange(subscriptionId: string, target: PlanDef): Promise<void> {
  const plan = await prisma.plan.findUnique({ where: { name: target.name } });
  if (!plan) throw new SubscriptionError(500, "plan_not_seeded");
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { planId: plan.id, agreedSetupFee: plan.setupFee, agreedMonthlyFee: plan.monthlyFee },
  });
}

/**
 * Upgrade a client to a higher tier. Test accounts apply instantly (the new plan's flags take
 * effect on the next workspace load); real accounts capture an UpgradeRequest for admin/sales to
 * apply (Stripe billing isn't built yet). Returns whether it was applied immediately.
 */
export async function requestUpgrade(
  clientId: string,
  toPlanName: string,
  reason?: string,
): Promise<{ applied: boolean }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { isTest: true, subscription: { select: { id: true, plan: { select: { name: true } } } } },
  });
  if (!client) throw new SubscriptionError(404, "client_not_found");
  const target = planByName(toPlanName);
  if (!target) throw new SubscriptionError(400, "invalid_plan");
  const fromPlan = client.subscription?.plan.name ?? "LAUNCH";

  if (client.isTest && client.subscription) {
    await applyPlanChange(client.subscription.id, target);
    await writeAudit({
      action: "subscription.upgraded",
      entityType: "Subscription",
      entityId: client.subscription.id,
      clientId,
      metadata: { fromPlan, toPlan: target.name, instant: true },
    });
    return { applied: true };
  }

  await prisma.upgradeRequest.create({ data: { clientId, fromPlan, toPlan: target.name, reason } });
  await writeAudit({
    action: "subscription.upgrade_requested",
    entityType: "Client",
    entityId: clientId,
    clientId,
    metadata: { fromPlan, toPlan: target.name, reason: reason ?? null },
  });
  return { applied: false };
}

/** Open upgrade requests for the admin queue. */
export async function listUpgradeRequests() {
  return prisma.upgradeRequest.findMany({
    where: { status: "requested" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { client: { select: { businessName: true } } },
  });
}

/** Admin applies a captured upgrade request → switches the plan, marks it applied. */
export async function applyUpgradeRequest(requestId: string, actorId: string | null) {
  const req = await prisma.upgradeRequest.findUnique({
    where: { id: requestId },
    include: { client: { select: { subscription: { select: { id: true } } } } },
  });
  if (!req) throw new SubscriptionError(404, "not_found");
  if (req.status !== "requested") return { ok: true as const };
  const target = planByName(req.toPlan);
  if (!target) throw new SubscriptionError(400, "invalid_plan");
  if (req.client.subscription) await applyPlanChange(req.client.subscription.id, target);
  await prisma.upgradeRequest.update({
    where: { id: requestId },
    data: { status: "applied", appliedById: actorId },
  });
  await writeAudit({
    action: "subscription.upgraded",
    entityType: "Client",
    entityId: req.clientId,
    clientId: req.clientId,
    actorId,
    metadata: { toPlan: target.name, viaRequest: requestId },
  });
  return { ok: true as const };
}
