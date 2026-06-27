import { prisma } from "@/lib/db";
import type { PlanName, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { SalesError } from "./errors";
import { quoteInputSchema, approvalDecisionSchema } from "./schema";
import { evaluateGuardrails } from "./guardrails";

/** Throws 404 unless `repId` is assigned to `prospectId`. */
async function assertAssigned(repId: string, prospectId: string): Promise<void> {
  const link = await prisma.salesAssignment.findFirst({
    where: { prospectId, employeeId: repId },
    select: { id: true },
  });
  if (!link) throw new SalesError("prospect_not_found", 404);
}

/**
 * Create a quote for a rep's prospect. Snapshots listed pricing, applies the discount guardrails
 * (docs/SALES_REP_PROGRAM.md §5), and — when the offer is outside rep authority — sets status
 * NEEDS_APPROVAL with a PENDING `QuoteApproval` so an admin must sign off before it can be sent.
 * Discounts are also recorded as `QuoteDiscount` rows for the audit/analytics trail.
 */
export async function createQuote(repId: string, input: unknown, actor?: { userId?: string }) {
  const parsed = quoteInputSchema.parse(input);
  await assertAssigned(repId, parsed.prospectId);

  const plan = await prisma.plan.findUnique({ where: { name: parsed.plan as PlanName } });
  if (!plan) throw new SalesError("invalid_plan", 400);

  if (parsed.offeredSetupFee > plan.setupFee || parsed.offeredMonthlyFee > plan.monthlyFee) {
    throw new SalesError("offer_above_listed", 400); // reps discount, never up-charge
  }

  const guard = evaluateGuardrails({
    plan: parsed.plan as PlanName,
    listedSetupCents: plan.setupFee,
    listedMonthlyCents: plan.monthlyFee,
    offeredSetupCents: parsed.offeredSetupFee,
    offeredMonthlyCents: parsed.offeredMonthlyFee,
  });

  const discounts: Prisma.QuoteDiscountCreateWithoutQuoteInput[] = [];
  if (guard.setupDiscountCents > 0) {
    discounts.push({
      target: "setup_fee",
      reason: parsed.discountReason ?? "Rep setup-fee discount",
      amount: guard.setupDiscountCents,
      requiresApproval: guard.reasons.includes("setup_below_floor") || guard.reasons.includes("setup_waived"),
    });
  }
  if (guard.monthlyDiscountCents > 0) {
    discounts.push({
      target: "monthly_fee",
      reason: parsed.discountReason ?? "Rep monthly-fee discount",
      amount: guard.monthlyDiscountCents,
      requiresApproval: true,
    });
  }

  const quote = await prisma.quote.create({
    data: {
      prospectId: parsed.prospectId,
      salesRepId: repId,
      status: guard.requiresApproval ? "NEEDS_APPROVAL" : "DRAFT",
      plan: parsed.plan as PlanName,
      listedSetupFee: plan.setupFee,
      listedMonthlyFee: plan.monthlyFee,
      offeredSetupFee: parsed.offeredSetupFee,
      offeredMonthlyFee: parsed.offeredMonthlyFee,
      discountReason: parsed.discountReason,
      contractLengthMonths: parsed.contractLengthMonths,
      customerNotes: parsed.customerNotes,
      internalNotes: parsed.internalNotes,
      requiresApproval: guard.requiresApproval,
      ...(discounts.length ? { discounts: { create: discounts } } : {}),
      ...(guard.requiresApproval ? { approvals: { create: { status: "PENDING" } } } : {}),
    },
    include: { discounts: true, approvals: true },
  });

  await writeAudit({
    action: "quote.created",
    entityType: "Quote",
    entityId: quote.id,
    actorId: actor?.userId ?? null,
    metadata: { repId, plan: parsed.plan, requiresApproval: guard.requiresApproval, reasons: guard.reasons },
  });
  await emit("quote.created", { quote });
  return quote;
}

/** The rep's quotes (optionally for one prospect), newest first. */
export async function listQuotes(repId: string, opts: { prospectId?: string } = {}) {
  return prisma.quote.findMany({
    where: { salesRepId: repId, ...(opts.prospectId ? { prospectId: opts.prospectId } : {}) },
    include: { prospect: { select: { id: true, businessName: true } }, approvals: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** One of the rep's quotes with full detail. Throws 404 if not theirs. */
export async function getQuote(repId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, salesRepId: repId },
    include: { prospect: true, discounts: true, approvals: { orderBy: { createdAt: "desc" } } },
  });
  if (!quote) throw new SalesError("quote_not_found", 404);
  return quote;
}

/**
 * Send a quote to the prospect. Only DRAFT (within guardrails) or admin-APPROVED quotes can be sent;
 * a quote still NEEDS_APPROVAL throws `approval_required`.
 */
export async function sendQuote(repId: string, quoteId: string, actor?: { userId?: string }) {
  const quote = await getQuote(repId, quoteId);
  if (quote.status === "NEEDS_APPROVAL") throw new SalesError("approval_required", 409);
  if (quote.status !== "DRAFT" && quote.status !== "APPROVED") {
    throw new SalesError("quote_not_sendable", 409);
  }
  const sent = await prisma.quote.update({
    where: { id: quoteId },
    data: { status: "SENT", sentAt: new Date() },
  });
  await writeAudit({
    action: "quote.sent",
    entityType: "Quote",
    entityId: quoteId,
    actorId: actor?.userId ?? null,
    metadata: { repId },
  });
  return sent;
}

// ── Admin approval queue ─────────────────────────────────────────────────────

/** Quotes awaiting admin sign-off (out-of-guardrail offers). */
export async function listPendingApprovals() {
  return prisma.quoteApproval.findMany({
    where: { status: "PENDING" },
    include: {
      quote: {
        include: {
          prospect: { select: { businessName: true } },
          salesRep: { include: { user: { select: { name: true } } } },
          discounts: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Admin decides a pending quote approval. APPROVED moves the quote to APPROVED (rep can now send);
 * REJECTED returns it to DRAFT so the rep can revise. The decision + comment are recorded and audited.
 */
export async function decideQuoteApproval(
  approvalId: string,
  input: unknown,
  admin: { userId: string },
) {
  const parsed = approvalDecisionSchema.parse(input);
  const approval = await prisma.quoteApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new SalesError("approval_not_found", 404);
  if (approval.status !== "PENDING") throw new SalesError("already_decided", 409);

  const [updated] = await prisma.$transaction([
    prisma.quoteApproval.update({
      where: { id: approvalId },
      data: { status: parsed.decision, approverId: admin.userId, decisionAt: new Date(), comment: parsed.comment },
    }),
    prisma.quote.update({
      where: { id: approval.quoteId },
      data: {
        status: parsed.decision === "APPROVED" ? "APPROVED" : "DRAFT",
        ...(parsed.decision === "APPROVED" ? { requiresApproval: false } : {}),
      },
    }),
  ]);

  await writeAudit({
    action: parsed.decision === "APPROVED" ? "quote.approved" : "quote.rejected",
    entityType: "Quote",
    entityId: approval.quoteId,
    actorId: admin.userId,
    metadata: { approvalId, comment: parsed.comment ?? null },
  });
  return updated;
}
