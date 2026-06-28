import { prisma } from "@/lib/db";
import type { PlanName } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { computeCommission } from "./commission";

/**
 * Commission accrual + settlement engine. The loop-closer: when a rep-attributed prospect becomes a
 * paying client, accrue a PENDING commission; once the client clears the clawback window while still
 * active, it becomes ELIGIBLE; if they cancel inside the window it's CLAWED_BACK. Poll-based (run from
 * the cron sweep) so it reconciles every setup-fee-paid path without the billing flow having to know
 * about commissions. See docs/SALES_REP_PROGRAM.md §3 & §6.
 */

/** CommissionRecord.planId is required — ensure a default active plan exists (seeds with schema defaults). */
export async function ensureActiveCommissionPlan() {
  const existing = await prisma.commissionPlan.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  return existing ?? prisma.commissionPlan.create({ data: { name: "Standard rep plan" } });
}

/** The attributed rep + paid-setup snapshot for a client, or null when not rep-sourced / unpaid. */
async function attribution(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      subscription: {
        select: {
          setupFeePaid: true,
          setupFeePaidAt: true,
          agreedSetupFee: true,
          plan: { select: { name: true, setupFee: true } },
        },
      },
      sourceQuote: { select: { salesRepId: true } },
      prospect: { select: { assignments: { select: { employeeId: true }, orderBy: { assignedAt: "asc" }, take: 1 } } },
    },
  });
  if (!client?.subscription?.setupFeePaid) return null;
  // Prefer the quote's rep (strongest link); fall back to the prospect's first-touch assignee.
  const repId = client.sourceQuote?.salesRepId ?? client.prospect?.assignments[0]?.employeeId ?? null;
  if (!repId) return null;
  return { repId, sub: client.subscription };
}

/**
 * Accrue the setup-fee commission for one client. Idempotent: at most one `setup_fee` record per
 * client. No-op when the client isn't rep-attributed or the setup fee isn't paid.
 */
export async function accrueCommissionForClient(clientId: string) {
  const att = await attribution(clientId);
  if (!att) return { accrued: false, reason: "no_attribution_or_unpaid" as const };

  const existing = await prisma.commissionRecord.findFirst({
    where: { clientId, basis: "setup_fee" },
    select: { id: true },
  });
  if (existing) return { accrued: false, reason: "already_accrued" as const };

  const plan = await ensureActiveCommissionPlan();
  const result = computeCommission({
    plan: att.sub.plan.name as PlanName,
    bases: { nectar: Number(plan.nectarBase), honey: Number(plan.honeyBase), hive: Number(plan.hiveBase) },
    listedSetupFeeCents: att.sub.plan.setupFee,
    collectedSetupFeeCents: att.sub.agreedSetupFee,
  });

  const paidAt = att.sub.setupFeePaidAt ?? new Date();
  const eligibleAt = new Date(paidAt.getTime() + plan.clawbackDays * 86_400_000);

  const record = await prisma.commissionRecord.create({
    data: {
      planId: plan.id,
      employeeId: att.repId,
      clientId,
      status: "PENDING",
      basis: "setup_fee",
      collectedRevenue: att.sub.agreedSetupFee / 100,
      amount: result.amount,
      eligibleAt,
    },
  });
  await writeAudit({
    action: "commission.accrued",
    entityType: "CommissionRecord",
    entityId: record.id,
    clientId,
    metadata: { repId: att.repId, amount: result.amount, basis: "setup_fee" },
  });
  return { accrued: true, recordId: record.id, amount: result.amount };
}

/** Accrue commissions for every paid, rep-attributed client that doesn't have one yet. */
export async function runCommissionAccrualSweep() {
  const candidates = await prisma.client.findMany({
    where: {
      subscription: { is: { setupFeePaid: true } },
      OR: [{ sourceQuoteId: { not: null } }, { prospectId: { not: null } }],
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  if (candidates.length === 0) return { accrued: 0, scanned: 0 };

  const alreadyAccrued = new Set(
    (
      await prisma.commissionRecord.findMany({
        where: { basis: "setup_fee", clientId: { in: candidates.map((c) => c.id) } },
        select: { clientId: true },
      })
    ).map((r) => r.clientId),
  );

  let accrued = 0;
  for (const c of candidates) {
    if (alreadyAccrued.has(c.id)) continue;
    const res = await accrueCommissionForClient(c.id);
    if (res.accrued) accrued++;
  }
  return { accrued, scanned: candidates.length };
}

/**
 * Settle PENDING commissions whose clawback window has elapsed: ELIGIBLE if the client's subscription
 * is still ACTIVE (first month cleared), CLAWED_BACK if they've cancelled/suspended inside the window.
 * Transient states (PAST_DUE/PAYMENT_FAILED) are left PENDING to retry next sweep.
 */
export async function runCommissionEligibilitySweep(now: Date) {
  const due = await prisma.commissionRecord.findMany({
    where: { status: "PENDING", eligibleAt: { lte: now } },
    select: { id: true, clientId: true },
    take: 500,
  });

  let eligible = 0;
  let clawedBack = 0;
  for (const rec of due) {
    if (!rec.clientId) continue;
    const sub = await prisma.subscription.findUnique({
      where: { clientId: rec.clientId },
      select: { status: true },
    });
    if (sub?.status === "ACTIVE") {
      await prisma.commissionRecord.update({ where: { id: rec.id }, data: { status: "ELIGIBLE", eligibleAt: now } });
      eligible++;
    } else if (sub?.status === "CANCELLED" || sub?.status === "SUSPENDED") {
      await prisma.commissionRecord.update({ where: { id: rec.id }, data: { status: "CLAWED_BACK", clawedBackAt: now } });
      clawedBack++;
    }
  }
  return { eligible, clawedBack, scanned: due.length };
}

/**
 * Reverse a client's commissions on cancellation/refund. Records not yet PAID flip to CLAWED_BACK;
 * already-PAID records are stamped `clawedBackAt` to net against a future payout. Call from the
 * cancellation/refund flow; the eligibility sweep also catches cancellations inside the window.
 */
export async function clawbackClientCommissions(clientId: string) {
  const now = new Date();
  const unpaid = await prisma.commissionRecord.updateMany({
    where: { clientId, status: { in: ["PENDING", "ELIGIBLE", "APPROVED"] } },
    data: { status: "CLAWED_BACK", clawedBackAt: now },
  });
  const paid = await prisma.commissionRecord.updateMany({
    where: { clientId, status: "PAID", clawedBackAt: null },
    data: { clawedBackAt: now },
  });
  if (unpaid.count + paid.count > 0) {
    await writeAudit({
      action: "commission.clawed_back",
      entityType: "Client",
      entityId: clientId,
      clientId,
      metadata: { reversed: unpaid.count, flaggedPaid: paid.count },
    });
  }
  return { reversed: unpaid.count, flaggedPaid: paid.count };
}
