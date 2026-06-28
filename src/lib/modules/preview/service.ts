import type { PreviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { startGeneration, claimAndRun, approveAndPublish } from "@/lib/modules/website";
import type { GenerationForm } from "@/lib/modules/website";
import { compileChangeRequest, markResolved } from "@/lib/modules/review";
import { setupFeeRequired } from "@/lib/auth/policy";
import { getUpdateQuota } from "@/lib/modules/subscription";
import { planRank } from "@/lib/plans";

export class PreviewError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const REVIEWABLE: PreviewStatus[] = ["PREVIEW_READY", "PREVIEW_SENT", "PREVIEW_VIEWED", "REVISION_COMPLETED"];

/** Latest preview for a client (raw row). */
export function getClientPreview(clientId: string) {
  return prisma.preview.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" } });
}

/** The latest version id of a client's preview website (the one being reviewed), or null.
 *  Used to scope client-side review comments — never trust a versionId from the request body. */
export async function getReviewableVersionId(clientId: string): Promise<string | null> {
  const preview = await getClientPreview(clientId);
  if (!preview?.websiteId) return null;
  const version = await prisma.websiteVersion.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return version?.id ?? null;
}

/**
 * Whether the signed-in client may mark up their preview right now: the preview must be in a
 * reviewable state AND they must have a free revision left ("pending additional reviews"). Returns
 * the version their pins attach to. Single source of truth for the client comment gate + dashboard.
 */
export async function getClientReviewContext(clientId: string) {
  const preview = await getClientPreview(clientId);
  if (!preview?.websiteId) return { canComment: false, versionId: null as string | null, revisionsLeft: 0 };

  // Live site: pins annotate the PUBLISHED version (what requestWebsiteUpdate → compileChangeRequest
  // reads) and are bounded by the monthly update quota rather than free revisions.
  if (preview.status === "LIVE") {
    const website = await prisma.website.findFirst({
      where: { clientId, status: "published", publishedVersionId: { not: null } },
      select: { publishedVersionId: true },
    });
    if (!website?.publishedVersionId) return { canComment: false, versionId: null as string | null, revisionsLeft: 0 };
    const quota = await getUpdateQuota(clientId);
    return { canComment: quota.remaining > 0, versionId: website.publishedVersionId, revisionsLeft: quota.remaining };
  }

  const revisionsLeft = Math.max(0, preview.maxFreeRevisions - preview.revisionCount);
  const versionId = REVIEWABLE.includes(preview.status) ? await getReviewableVersionId(clientId) : null;
  return { canComment: revisionsLeft > 0 && !!versionId, versionId, revisionsLeft };
}

/**
 * Request the one free revision — records it and regenerates. Folds in the client's open
 * pin comments (from "Mark up your preview") alongside any typed note, so a single revision
 * carries everything. `note` may be empty when the client only left pins.
 */
export async function requestRevision(clientId: string, note?: string) {
  const preview = await getClientPreview(clientId);
  if (!preview || !preview.websiteId) throw new PreviewError(404, "no_preview");
  if (preview.status === "LIVE") throw new PreviewError(400, "already_live");
  if (preview.revisionCount >= preview.maxFreeRevisions) throw new PreviewError(403, "no_revisions_left");

  // Bundle any pinned change-requests on the latest version into the instruction.
  const versionId = await getReviewableVersionId(clientId);
  const pins = versionId
    ? await compileChangeRequest(versionId)
    : { note: "", commentIds: [], edits: [] };
  const combined = [note?.trim(), pins.note].filter(Boolean).join("\n\n");
  if (!combined) throw new PreviewError(400, "no_content");

  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  const base = (lastJob?.inputIntake ?? {}) as Record<string, unknown>;
  // Surgical edit targets: the anchored pins, plus the typed "additional comments" (if any) as a
  // single un-anchored request so it's applied minimally rather than triggering a full rebuild.
  const revisionEdits = [...pins.edits];
  const typed = note?.trim();
  if (typed) revisionEdits.push({ pagePath: "", selector: null, anchorText: null, instruction: typed });
  // Client-initiated revisions auto-show to the client when ready (no admin review step).
  const form = { ...base, revisionNote: combined, revisionEdits, autoRelease: true } as GenerationForm;

  await prisma.preview.update({
    where: { id: preview.id },
    data: { status: "PREVIEW_GENERATING", revisionCount: { increment: 1 } },
  });
  await prisma.previewRevision.create({
    data: { previewId: preview.id, requestedBy: "customer", requestText: combined, status: "in_progress" },
  });

  const { jobId } = await startGeneration(clientId, form);
  void claimAndRun(jobId).catch((e) => console.error("[preview] revision job failed", jobId, e));
  if (pins.commentIds.length) await markResolved(pins.commentIds, null);
  await writeAudit({ action: "preview.revision_requested", entityType: "Preview", entityId: preview.id, clientId });
  return { ok: true };
}

/** Approve the preview. Test accounts launch immediately; real accounts await setup-fee payment. */
export async function approve(clientId: string) {
  const preview = await getClientPreview(clientId);
  if (!preview) throw new PreviewError(404, "no_preview");
  if (preview.status === "LIVE") return { launched: true };
  if (preview.status !== "PREVIEW_READY") throw new PreviewError(400, "not_ready");

  // Approving a change to an already-launched site: the setup fee is already paid, so republish the
  // new version straight to the live site — no payment step. Decide "already launched" from durable
  // signals (publishedVersionId / setupFeePaid), NOT website.status: generating an update can leave
  // status non-"published", which would otherwise make this re-charge the setup fee.
  const website = preview.websiteId
    ? await prisma.website.findUnique({ where: { id: preview.websiteId }, select: { status: true, publishedVersionId: true } })
    : null;
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { setupFeePaid: true, plan: { select: { name: true } } },
  });
  const alreadyLaunched =
    website?.status === "published" || Boolean(website?.publishedVersionId) || sub?.setupFeePaid === true;
  if (alreadyLaunched) {
    // Guard the free-republish path: if this pending version was previewed at a HIGHER tier than the
    // client pays for (a free tier-preview), it must NOT go live for free — they have to upgrade first
    // (setup-fee delta + prorated monthly). Once they've upgraded, paid plan == selectedPlan and this
    // republishes normally. Same-tier updates keep republishing free.
    if (preview.selectedPlan && sub && planRank(preview.selectedPlan) > planRank(sub.plan.name)) {
      return { launched: false, awaitingUpgrade: true, toPlan: preview.selectedPlan };
    }
    await launchPreview(preview.id);
    await writeAudit({ action: "preview.update_approved", entityType: "Preview", entityId: preview.id, clientId });
    return { launched: true, updated: true };
  }

  await prisma.preview.update({ where: { id: preview.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  await writeAudit({ action: "preview.approved", entityType: "Preview", entityId: preview.id, clientId });

  // Whether the one-time setup fee must be collected before launch. Centralized + fail-closed:
  // test accounts launch free; real accounts require payment in production even if the flag is unset.
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { isTest: true } });
  if (!setupFeeRequired(client ?? { isTest: false })) {
    await launchPreview(preview.id);
    return { launched: true };
  }
  // Real accounts: setup fee must be paid before launch (Stripe phase).
  await prisma.preview.update({ where: { id: preview.id }, data: { status: "SETUP_FEE_PENDING" } });
  return { launched: false, awaitingPayment: true };
}

/**
 * Launch a preview: publish the latest version, activate the subscription, record the
 * Conversion. Called for test accounts on approval, and (later) by the Stripe webhook
 * once the setup fee is paid.
 */
export async function launchPreview(previewId: string) {
  const preview = await prisma.preview.findUnique({ where: { id: previewId } });
  if (!preview?.websiteId || !preview.clientId) throw new PreviewError(400, "cannot_launch");

  const version = await prisma.websiteVersion.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!version) throw new PreviewError(400, "no_version");
  await approveAndPublish(version.id, null); // website.status -> published

  const sub = await prisma.subscription.findUnique({ where: { clientId: preview.clientId } });
  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "ACTIVE", currentPeriodStart: new Date() },
    });
    await prisma.conversion.upsert({
      where: { previewId: preview.id },
      update: { subscriptionStartedAt: new Date() },
      create: {
        previewId: preview.id,
        prospectId: preview.prospectId,
        clientId: preview.clientId,
        selectedPlan: preview.selectedPlan,
        setupFeeAmount: sub.agreedSetupFee,
        monthlyAmount: sub.agreedMonthlyFee,
        setupFeePaidAt: new Date(),
        subscriptionStartedAt: new Date(),
      },
    });
  }

  await prisma.preview.update({ where: { id: preview.id }, data: { status: "LIVE" } });
  await writeAudit({ action: "preview.launched", entityType: "Preview", entityId: preview.id, clientId: preview.clientId });
  return { ok: true };
}

