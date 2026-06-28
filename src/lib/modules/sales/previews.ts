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
  intake: websiteIntakeSchema,
});
export type PreviewRequestInput = z.infer<typeof previewRequestSchema>;

function publicToken(): string {
  return randomBytes(24).toString("base64url");
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

  // One provisional client per prospect (Client.prospectId is unique). If one already exists the
  // prospect is already in a preview/converted — surface that rather than colliding.
  if (await prisma.client.findFirst({ where: { prospectId: parsed.prospectId }, select: { id: true } })) {
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

  const preview = await prisma.preview.create({
    data: {
      prospectId: parsed.prospectId,
      clientId: client.id,
      websiteId,
      selectedPlan: parsed.selectedPlan as PlanName,
      status: "PREVIEW_GENERATING",
      createdById: actor?.userId ?? null,
      assignedSalesRepId: repId,
      publicToken: publicToken(),
    },
  });

  await writeAudit({
    action: "preview.requested",
    entityType: "Preview",
    entityId: preview.id,
    clientId: client.id,
    actorId: actor?.userId ?? null,
    metadata: { repId, prospectId: parsed.prospectId, plan: parsed.selectedPlan },
  });

  return { previewId: preview.id, jobId, clientId: client.id, publicToken: preview.publicToken };
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
export async function getProspectPreview(repId: string, prospectId: string) {
  await assertRepAssignedToProspect(repId, prospectId);
  const preview = await prisma.preview.findFirst({
    where: { prospectId, assignedSalesRepId: repId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, publicToken: true, selectedPlan: true, sentAt: true, viewedAt: true, websiteId: true, createdAt: true },
  });
  const unsettled = preview?.status === "PREVIEW_GENERATING" || preview?.status === "IN_REVIEW";
  if (unsettled && preview?.websiteId) {
    const version = await prisma.websiteVersion.findFirst({ where: { websiteId: preview.websiteId }, select: { id: true } });
    if (version) {
      await prisma.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_READY", generatedAt: new Date() } }).catch(() => {});
      preview.status = "PREVIEW_READY";
    }
  }
  return preview;
}
