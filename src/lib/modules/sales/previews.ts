import { randomBytes } from "crypto";
import { z } from "zod";
import type { PlanName } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { uniqueClientSlug } from "@/lib/slug";
import { startGeneration, claimAndRun, regenerateFromScratch, websiteIntakeSchema } from "@/lib/modules/website";
import { appBase } from "@/lib/modules/email";
import { sendPreviewToProspect } from "@/lib/modules/email/notifications";
import { SalesError } from "./errors";
import { evaluateGuardrails, REP_SETUP_FLOOR_CENTS, MONTHLY_PROMO_MONTHS } from "./guardrails";
import { approvalDecisionSchema } from "./schema";

export { MONTHLY_PROMO_MONTHS };

/**
 * Rep-initiated free website preview (the core of PageBee's acquisition pitch). A preview is
 * generated against a *provisional* Client created for the prospect — no login, no payment, marked
 * `isTest` — so the rep can show real work before the prospect signs up. On conversion the same
 * client is adopted (see convertQuoteToClient). The preview gets an unguessable public token so the
 * rep can share /p/{token} with no account required. See docs/SALES_REP_PROGRAM.md §7 / ONBOARDING §9.
 */

export const previewRequestSchema = z.object({
  prospectId: z.string().min(1),
  selectedPlan: z.enum(["NECTAR", "HONEY", "HIVE"]),
  // Optional rep concessions applied at creation: % off the one-time setup fee and/or a promotional
  // % off the monthly fee for the first year (the latter always needs admin approval — see below).
  setupDiscountPct: z.number().int().min(0).max(100).optional(),
  monthlyDiscountPct: z.number().int().min(0).max(100).optional(),
  intake: websiteIntakeSchema,
});
export type PreviewRequestInput = z.infer<typeof previewRequestSchema>;

function publicToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Keep a setup-fee discount within 0–100%. Undefined/NaN → 0. */
function clampDiscount(pct?: number): number {
  if (typeof pct !== "number" || Number.isNaN(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Decide whether a requested discount is within rep authority. Reps may discount the SETUP fee down
 * to the plan floor freely (auto-applies); below the floor (or waiving it) needs approval. ANY
 * MONTHLY promo discount is always out of authority → it always needs approval. The two are one
 * request: if either piece needs approval, the whole thing pends. Mirrors the quote guardrails (§5).
 */
function gateDiscount(
  plan: PlanName,
  listSetupCents: number,
  listMonthlyCents: number,
  setupPct: number,
  monthlyPct: number,
): { setupPct: number; monthlyPct: number; needsApproval: boolean } {
  const setup = clampDiscount(setupPct);
  const monthly = clampDiscount(monthlyPct);
  if (setup === 0 && monthly === 0) return { setupPct: 0, monthlyPct: 0, needsApproval: false };
  const guard = evaluateGuardrails({
    plan,
    listedSetupCents: listSetupCents,
    listedMonthlyCents: listMonthlyCents,
    offeredSetupCents: Math.round(listSetupCents * (1 - setup / 100)),
    offeredMonthlyCents: Math.round(listMonthlyCents * (1 - monthly / 100)),
  });
  return { setupPct: setup, monthlyPct: monthly, needsApproval: guard.requiresApproval };
}

/** The largest SETUP discount % a rep can give without approval (keeps setup at or above the plan
 *  floor). Powers the rep-facing "max you can offer" tip. Monthly promos always need approval, so
 *  there's no equivalent monthly threshold. */
export function maxSelfApprovedSetupPct(plan: PlanName, listSetupCents: number): number {
  if (!listSetupCents) return 0;
  const floor = REP_SETUP_FLOOR_CENTS[plan];
  return Math.max(0, Math.floor((1 - floor / listSetupCents) * 100));
}

/** Throws 404 unless `repId` is assigned to `prospectId`. Exported for routes that act on a
 *  prospect's preview assets (e.g. rep uploads) and need the same tenancy guard. */
export async function assertRepAssignedToProspect(repId: string, prospectId: string): Promise<void> {
  const link = await prisma.salesAssignment.findFirst({
    where: { prospectId, employeeId: repId },
    select: { id: true },
  });
  if (!link) throw new SalesError("prospect_not_found", 404);
}

/**
 * Create the provisional client + kick off generation for a prospect's preview. Returns the
 * generation `jobId` so the caller (API route) can run it inline or offload it, mirroring the
 * self-serve generate route.
 */
export async function requestPreview(repId: string, input: unknown, actor?: { userId?: string }) {
  const parsed = previewRequestSchema.parse(input);
  await assertRepAssignedToProspect(repId, parsed.prospectId);

  const prospect = await prisma.prospect.findUnique({
    where: { id: parsed.prospectId },
    select: { businessName: true, businessType: true, contactName: true, email: true, phone: true },
  });
  if (!prospect) throw new SalesError("prospect_not_found", 404);

  // A prospect can hold several previews at once — one per showcase plan (e.g. a Nectar AND a Hive
  // version) — but not two of the SAME plan. A duplicate plan should be regenerated, not re-created.
  if (await prisma.preview.findFirst({ where: { prospectId: parsed.prospectId, selectedPlan: parsed.selectedPlan as PlanName }, select: { id: true } })) {
    throw new SalesError("preview_exists", 409);
  }

  const plan = await prisma.plan.findUnique({ where: { name: parsed.selectedPlan as PlanName } });
  if (!plan) throw new SalesError("invalid_plan", 400);

  const slug = await uniqueClientSlug(prospect.businessName);
  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: {
        slug,
        businessName: prospect.businessName,
        businessType: prospect.businessType,
        ownerName: prospect.contactName ?? prospect.businessName,
        ownerEmail: prospect.email,
        ownerPhone: prospect.phone,
        isTest: true, // provisional — not a paying tenant until conversion adopts it
        status: "active",
        prospectId: parsed.prospectId,
      },
    });
    await tx.subscription.create({
      data: {
        clientId: c.id,
        planId: plan.id,
        status: "SETUP_PENDING",
        agreedSetupFee: plan.setupFee,
        agreedMonthlyFee: plan.monthlyFee,
        setupFeePaid: false,
      },
    });
    return c;
  });

  const { jobId, websiteId } = await startGeneration(client.id, {
    ...parsed.intake,
    previewPlan: parsed.selectedPlan as PlanName,
    autoRelease: true, // rep previews skip platform review — the rep is the reviewer
  });

  // Gate the opening discount: a setup discount within rep authority applies on the spot; a setup
  // discount below the floor OR any monthly promo lands as a pending request (effective stays 0)
  // with an approval row an admin must sign off.
  const gate = gateDiscount(parsed.selectedPlan as PlanName, plan.setupFee, plan.monthlyFee, parsed.setupDiscountPct ?? 0, parsed.monthlyDiscountPct ?? 0);
  const preview = await prisma.preview.create({
    data: {
      prospectId: parsed.prospectId,
      clientId: client.id,
      websiteId,
      selectedPlan: parsed.selectedPlan as PlanName,
      status: "PREVIEW_GENERATING",
      setupDiscountPct: gate.needsApproval ? 0 : gate.setupPct,
      pendingDiscountPct: gate.needsApproval ? gate.setupPct : null,
      monthlyDiscountPct: gate.needsApproval ? 0 : gate.monthlyPct,
      pendingMonthlyPct: gate.needsApproval ? gate.monthlyPct : null,
      createdById: actor?.userId ?? null,
      assignedSalesRepId: repId,
      publicToken: publicToken(),
      ...(gate.needsApproval ? { discountApprovals: { create: { requestedById: repId, requestedPct: gate.setupPct, requestedMonthlyPct: gate.monthlyPct } } } : {}),
    },
  });

  await writeAudit({
    action: "preview.requested",
    entityType: "Preview",
    entityId: preview.id,
    clientId: client.id,
    actorId: actor?.userId ?? null,
    metadata: { repId, prospectId: parsed.prospectId, plan: parsed.selectedPlan, setupPct: gate.setupPct, monthlyPct: gate.monthlyPct, discountPending: gate.needsApproval },
  });

  return { previewId: preview.id, jobId, clientId: client.id, publicToken: preview.publicToken, discountPending: gate.needsApproval };
}

/** Mark a preview as sent to the prospect (the rep is sharing the link). Scoped to the rep. */
export async function markPreviewSent(repId: string, previewId: string) {
  const preview = await prisma.preview.findFirst({
    where: { id: previewId, assignedSalesRepId: repId },
    select: { id: true, prospectId: true, publicToken: true, sentAt: true },
  });
  if (!preview) throw new SalesError("preview_not_found", 404);

  await prisma.preview.update({
    where: { id: preview.id },
    data: { status: "PREVIEW_SENT", ...(preview.sentAt ? {} : { sentAt: new Date() }) },
  });
  if (preview.prospectId) {
    await prisma.prospect.update({ where: { id: preview.prospectId }, data: { status: "preview_sent" } }).catch(() => {});
  }
  await writeAudit({ action: "preview.sent", entityType: "Preview", entityId: preview.id, metadata: { repId } });
  return { publicToken: preview.publicToken };
}

/**
 * Email the prospect their preview link (the rep is happy with it and wants to send it over). Scoped
 * to the rep; uses the prospect's CRM email and the unguessable /p/{token} viewer. Marks PREVIEW_SENT.
 */
export async function emailPreviewToProspect(repId: string, previewId: string, actor?: { userId?: string }) {
  const preview = await prisma.preview.findFirst({
    where: { id: previewId, assignedSalesRepId: repId },
    select: { id: true, prospectId: true, publicToken: true, sentAt: true },
  });
  if (!preview) throw new SalesError("preview_not_found", 404);
  if (!preview.publicToken) throw new SalesError("not_ready", 409);

  const prospect = preview.prospectId
    ? await prisma.prospect.findUnique({ where: { id: preview.prospectId }, select: { email: true, businessName: true, contactName: true } })
    : null;
  if (!prospect?.email) throw new SalesError("no_prospect_email", 400);

  await sendPreviewToProspect(prospect.email, {
    businessName: prospect.businessName,
    contactName: prospect.contactName,
    previewUrl: `${appBase()}/p/${preview.publicToken}`,
  });

  await prisma.preview.update({
    where: { id: preview.id },
    data: { status: "PREVIEW_SENT", ...(preview.sentAt ? {} : { sentAt: new Date() }) },
  });
  if (preview.prospectId) {
    await prisma.prospect.update({ where: { id: preview.prospectId }, data: { status: "preview_sent" } }).catch(() => {});
    // Log on the prospect's timeline (fail-soft — the email has already gone out).
    await prisma.prospectActivity
      .create({
        data: { prospectId: preview.prospectId, type: "email", summary: `Preview emailed to ${prospect.email}`, createdById: actor?.userId ?? null },
      })
      .catch(() => {});
  }
  await writeAudit({ action: "preview.emailed_to_prospect", entityType: "Preview", entityId: preview.id, actorId: actor?.userId ?? null, metadata: { repId, to: prospect.email } });
  return { ok: true as const, to: prospect.email };
}

/** A rep-owned preview ready for a generation action (regenerate / request-changes). Scoped to the rep. */
async function repPreviewForAction(repId: string, previewId: string) {
  const preview = await prisma.preview.findFirst({
    where: { id: previewId, assignedSalesRepId: repId },
    select: { id: true, websiteId: true, clientId: true, status: true },
  });
  if (!preview?.websiteId || !preview.clientId) throw new SalesError("preview_not_found", 404);
  if (preview.status === "PREVIEW_GENERATING") throw new SalesError("already_generating", 409);
  return preview as { id: string; websiteId: string; clientId: string; status: string };
}

/**
 * Rep "regenerate from scratch": a fresh full rebuild of the preview from the same intake (no edits),
 * reusing the admin engine. Rep-scoped; stays auto-released (the stored intake already carries
 * autoRelease), so it never re-enters platform review.
 */
export async function repRegeneratePreview(repId: string, previewId: string, actor?: { userId?: string }) {
  const preview = await repPreviewForAction(repId, previewId);
  const version = await prisma.websiteVersion.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!version) throw new SalesError("not_ready", 409);
  await prisma.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_GENERATING" } });
  await regenerateFromScratch(version.id, actor?.userId ?? null);
  await writeAudit({ action: "preview.rep_regenerated", entityType: "Preview", entityId: preview.id, clientId: preview.clientId, actorId: actor?.userId ?? null });
  return { ok: true as const };
}

/**
 * Rep "request changes": a free-text instruction the AI applies as a surgical edit (mirrors the
 * client revision path), regenerating the preview. Rep-scoped and auto-released.
 */
export async function repRequestChanges(repId: string, previewId: string, note: string, actor?: { userId?: string }) {
  const text = (note ?? "").trim();
  if (!text) throw new SalesError("no_content", 400);
  const preview = await repPreviewForAction(repId, previewId);

  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  const base = (lastJob?.inputIntake ?? {}) as Record<string, unknown>;
  const form = {
    ...base,
    revisionNote: text,
    revisionEdits: [{ pagePath: "", selector: null, anchorText: null, instruction: text }],
    autoRelease: true,
  } as unknown as Parameters<typeof startGeneration>[1];

  await prisma.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_GENERATING" } });
  await prisma.previewRevision.create({ data: { previewId: preview.id, requestedBy: repId, requestText: text, status: "in_progress" } });

  const { jobId } = await startGeneration(preview.clientId, form);
  void claimAndRun(jobId).catch((e) => console.error("[rep/preview] request-changes job failed", jobId, e));
  await writeAudit({ action: "preview.rep_revision_requested", entityType: "Preview", entityId: preview.id, clientId: preview.clientId, actorId: actor?.userId ?? null });
  return { ok: true as const, jobId };
}

/**
 * The rep's preview for a prospect (status + share token), or null. Scoped to the rep. Lazily
 * settles the preview to PREVIEW_READY once the website actually has a generated version.
 *
 * Rep-originated previews skip platform (admin) review: the generation pipeline lands the Preview in
 * PREVIEW_GENERATING (created here) and then IN_REVIEW (set by runGenerationJob's generic path), but
 * for a rep preview the rep is the reviewer — so as soon as a version exists we settle it to
 * PREVIEW_READY. (The public /p/{token} viewer never gated on admin review anyway.)
 */
const PREVIEW_SELECT = {
  id: true,
  status: true,
  publicToken: true,
  selectedPlan: true,
  setupDiscountPct: true,
  pendingDiscountPct: true,
  monthlyDiscountPct: true,
  pendingMonthlyPct: true,
  sentAt: true,
  viewedAt: true,
  websiteId: true,
  createdAt: true,
} as const;

type PreviewRow = { id: string; status: string; websiteId: string | null };

/** Settle a still-generating rep preview to PREVIEW_READY once a version exists (rep previews skip
 *  admin review — the rep is the reviewer). Mutates `preview.status` in place. */
async function settlePreview(preview: PreviewRow): Promise<void> {
  const unsettled = preview.status === "PREVIEW_GENERATING" || preview.status === "IN_REVIEW";
  if (!unsettled || !preview.websiteId) return;
  const version = await prisma.websiteVersion.findFirst({ where: { websiteId: preview.websiteId }, select: { id: true } });
  if (version) {
    await prisma.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_READY", generatedAt: new Date() } }).catch(() => {});
    preview.status = "PREVIEW_READY";
  }
}

export async function getProspectPreview(repId: string, prospectId: string) {
  await assertRepAssignedToProspect(repId, prospectId);
  const preview = await prisma.preview.findFirst({
    where: { prospectId, assignedSalesRepId: repId },
    orderBy: { createdAt: "desc" },
    select: PREVIEW_SELECT,
  });
  if (preview) await settlePreview(preview);
  return preview;
}

/**
 * Every preview this rep has for a prospect (newest first), each lazily settled to PREVIEW_READY.
 * Backs the multi-preview panel — a prospect can hold one preview per showcase plan at once.
 */
export async function listProspectPreviews(repId: string, prospectId: string) {
  await assertRepAssignedToProspect(repId, prospectId);
  const previews = await prisma.preview.findMany({
    where: { prospectId, assignedSalesRepId: repId },
    orderBy: { createdAt: "desc" },
    select: PREVIEW_SELECT,
  });
  await Promise.all(previews.map(settlePreview));
  return previews;
}

/**
 * Rep sets the discount on one of their previews: a setup-fee % and/or a promotional monthly % (for
 * the first year). A setup discount within rep authority (down to the plan floor) applies
 * immediately; a below-floor setup discount OR any monthly promo is recorded as a pending request an
 * admin must approve before it takes effect — the in-force discount is untouched until then. Any
 * earlier pending request is superseded. Scoped to the rep.
 */
export async function setPreviewDiscount(repId: string, previewId: string, setupPct: number, monthlyPct = 0) {
  const preview = await prisma.preview.findFirst({
    where: { id: previewId, assignedSalesRepId: repId },
    select: { id: true, selectedPlan: true },
  });
  if (!preview) throw new SalesError("preview_not_found", 404);

  const plan = await prisma.plan.findUnique({ where: { name: preview.selectedPlan }, select: { setupFee: true, monthlyFee: true } });
  if (!plan) throw new SalesError("invalid_plan", 400);

  const gate = gateDiscount(preview.selectedPlan, plan.setupFee, plan.monthlyFee, setupPct, monthlyPct);

  // Clear any superseded pending request, then either apply or open a fresh approval.
  await prisma.previewDiscountApproval.updateMany({
    where: { previewId: preview.id, status: "PENDING" },
    data: { status: "REJECTED", decisionAt: new Date(), comment: "Superseded by a newer request" },
  });

  if (gate.needsApproval) {
    await prisma.preview.update({ where: { id: preview.id }, data: { pendingDiscountPct: gate.setupPct, pendingMonthlyPct: gate.monthlyPct } });
    await prisma.previewDiscountApproval.create({ data: { previewId: preview.id, requestedById: repId, requestedPct: gate.setupPct, requestedMonthlyPct: gate.monthlyPct } });
    await writeAudit({ action: "preview.discount_requested", entityType: "Preview", entityId: preview.id, metadata: { repId, requestedPct: gate.setupPct, requestedMonthlyPct: gate.monthlyPct } });
    return { ok: true as const, pending: true as const, requestedPct: gate.setupPct, requestedMonthlyPct: gate.monthlyPct };
  }

  // No monthly here (a monthly promo always needs approval) — only the setup applies.
  await prisma.preview.update({ where: { id: preview.id }, data: { setupDiscountPct: gate.setupPct, pendingDiscountPct: null, pendingMonthlyPct: null } });
  await writeAudit({ action: "preview.discount_set", entityType: "Preview", entityId: preview.id, metadata: { repId, setupDiscountPct: gate.setupPct } });
  return { ok: true as const, pending: false as const, setupDiscountPct: gate.setupPct };
}

// ── Admin approval queue (preview setup-fee discounts) ────────────────────────

export interface PreviewDiscountApprovalRow {
  id: string;
  previewId: string;
  rep: string;
  prospect: string;
  plan: PlanName;
  listedSetupCents: number;
  requestedPct: number;
  requestedSetupCents: number;
  listedMonthlyCents: number;
  requestedMonthlyPct: number;
  requestedMonthlyCents: number;
  promoMonths: number;
  createdAt: Date;
}

/** Preview discount requests awaiting admin sign-off (setup below the plan floor and/or a monthly
 *  promo), enriched with prospect + rep names and the requested prices. (Preview has no prospect/rep
 *  relation, so we resolve those by id.) */
export async function listPreviewDiscountApprovals(): Promise<PreviewDiscountApprovalRow[]> {
  const approvals = await prisma.previewDiscountApproval.findMany({
    where: { status: "PENDING" },
    include: { preview: { select: { id: true, selectedPlan: true, prospectId: true, assignedSalesRepId: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!approvals.length) return [];

  const prospectIds = [...new Set(approvals.map((a) => a.preview.prospectId).filter((x): x is string => Boolean(x)))];
  const repIds = [...new Set(approvals.map((a) => a.preview.assignedSalesRepId).filter((x): x is string => Boolean(x)))];
  const planNames = [...new Set(approvals.map((a) => a.preview.selectedPlan))];

  const [prospects, reps, plans] = await Promise.all([
    prospectIds.length ? prisma.prospect.findMany({ where: { id: { in: prospectIds } }, select: { id: true, businessName: true } }) : [],
    repIds.length ? prisma.employee.findMany({ where: { id: { in: repIds } }, select: { id: true, user: { select: { name: true } } } }) : [],
    prisma.plan.findMany({ where: { name: { in: planNames } }, select: { name: true, setupFee: true, monthlyFee: true } }),
  ]);
  const prospectName = new Map(prospects.map((p) => [p.id, p.businessName]));
  const repName = new Map(reps.map((r) => [r.id, r.user?.name ?? null]));
  const setupFee = new Map(plans.map((p) => [p.name, p.setupFee]));
  const monthlyFee = new Map(plans.map((p) => [p.name, p.monthlyFee]));

  return approvals.map((a) => {
    const listedSetup = setupFee.get(a.preview.selectedPlan) ?? 0;
    const listedMonthly = monthlyFee.get(a.preview.selectedPlan) ?? 0;
    return {
      id: a.id,
      previewId: a.preview.id,
      rep: (a.preview.assignedSalesRepId && repName.get(a.preview.assignedSalesRepId)) || "—",
      prospect: (a.preview.prospectId && prospectName.get(a.preview.prospectId)) || "—",
      plan: a.preview.selectedPlan,
      listedSetupCents: listedSetup,
      requestedPct: a.requestedPct,
      requestedSetupCents: Math.round(listedSetup * (1 - a.requestedPct / 100)),
      listedMonthlyCents: listedMonthly,
      requestedMonthlyPct: a.requestedMonthlyPct,
      requestedMonthlyCents: Math.round(listedMonthly * (1 - a.requestedMonthlyPct / 100)),
      promoMonths: MONTHLY_PROMO_MONTHS,
      createdAt: a.createdAt,
    };
  });
}

/**
 * Admin decides a pending preview discount. APPROVED puts the requested % in force (and stamps it as
 * the preview's effective discount); REJECTED leaves the in-force discount unchanged. Either way the
 * pending marker is cleared. Recorded + audited.
 */
export async function decidePreviewDiscountApproval(approvalId: string, input: unknown, admin: { userId: string }) {
  const parsed = approvalDecisionSchema.parse(input);
  const approval = await prisma.previewDiscountApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new SalesError("approval_not_found", 404);
  if (approval.status !== "PENDING") throw new SalesError("already_decided", 409);

  const [updated] = await prisma.$transaction([
    prisma.previewDiscountApproval.update({
      where: { id: approvalId },
      data: { status: parsed.decision, approverId: admin.userId, decisionAt: new Date(), comment: parsed.comment },
    }),
    prisma.preview.update({
      where: { id: approval.previewId },
      data: {
        pendingDiscountPct: null,
        pendingMonthlyPct: null,
        ...(parsed.decision === "APPROVED" ? { setupDiscountPct: approval.requestedPct, monthlyDiscountPct: approval.requestedMonthlyPct } : {}),
      },
    }),
  ]);

  await writeAudit({
    action: parsed.decision === "APPROVED" ? "preview.discount_approved" : "preview.discount_rejected",
    entityType: "Preview",
    entityId: approval.previewId,
    actorId: admin.userId,
    metadata: { approvalId, requestedPct: approval.requestedPct, requestedMonthlyPct: approval.requestedMonthlyPct, comment: parsed.comment ?? null },
  });
  return updated;
}
