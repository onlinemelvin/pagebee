import { randomBytes } from "crypto";
import { z } from "zod";
import type { PlanName } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { uniqueClientSlug } from "@/lib/slug";
import { startGeneration, websiteIntakeSchema } from "@/lib/modules/website";
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

/** Throws 404 unless `repId` is assigned to `prospectId`. */
async function assertAssigned(repId: string, prospectId: string): Promise<void> {
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
  await assertAssigned(repId, parsed.prospectId);

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
 * The rep's preview for a prospect (status + share token), or null. Scoped to the rep. Lazily
 * reconciles a still-"generating" preview to PREVIEW_READY once the website actually has a generated
 * version — the generation pipeline updates the Website/job, not this Preview row, so we settle it here.
 */
export async function getProspectPreview(repId: string, prospectId: string) {
  await assertAssigned(repId, prospectId);
  const preview = await prisma.preview.findFirst({
    where: { prospectId, assignedSalesRepId: repId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, publicToken: true, selectedPlan: true, sentAt: true, viewedAt: true, websiteId: true, createdAt: true },
  });
  if (preview?.status === "PREVIEW_GENERATING" && preview.websiteId) {
    const version = await prisma.websiteVersion.findFirst({ where: { websiteId: preview.websiteId }, select: { id: true } });
    if (version) {
      await prisma.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_READY", generatedAt: new Date() } }).catch(() => {});
      preview.status = "PREVIEW_READY";
    }
  }
  return preview;
}
