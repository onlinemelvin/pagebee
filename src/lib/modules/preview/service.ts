import type { PreviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { sendEmail } from "@/lib/modules/email";
import { startGeneration, claimAndRun, approveAndPublish } from "@/lib/modules/website";
import type { WebsiteIntakeForm } from "@/lib/modules/website";

export class PreviewError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const REMIND_BEFORE = Number(process.env.PREVIEW_REMIND_DAYS ?? 2);
const REVIEWABLE: PreviewStatus[] = ["PREVIEW_READY", "PREVIEW_SENT", "PREVIEW_VIEWED", "REVISION_COMPLETED"];

/** Latest preview for a client (raw row). */
export function getClientPreview(clientId: string) {
  return prisma.preview.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" } });
}

/** Request the one free revision — records it and regenerates with the note. */
export async function requestRevision(clientId: string, note: string) {
  const preview = await getClientPreview(clientId);
  if (!preview || !preview.websiteId) throw new PreviewError(404, "no_preview");
  if (preview.status === "LIVE") throw new PreviewError(400, "already_live");
  if (preview.revisionCount >= preview.maxFreeRevisions) throw new PreviewError(403, "no_revisions_left");

  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { websiteId: preview.websiteId },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  const base = (lastJob?.inputIntake ?? {}) as Record<string, unknown>;
  const form = { ...base, revisionNote: note } as WebsiteIntakeForm;

  await prisma.preview.update({
    where: { id: preview.id },
    data: { status: "PREVIEW_GENERATING", revisionCount: { increment: 1 } },
  });
  await prisma.previewRevision.create({
    data: { previewId: preview.id, requestedBy: "customer", requestText: note, status: "in_progress" },
  });

  const { jobId } = await startGeneration(clientId, form);
  void claimAndRun(jobId).catch((e) => console.error("[preview] revision job failed", jobId, e));
  await writeAudit({ action: "preview.revision_requested", entityType: "Preview", entityId: preview.id, clientId });
  return { ok: true };
}

/** Approve the preview. Test accounts launch immediately; real accounts await setup-fee payment. */
export async function approve(clientId: string) {
  const preview = await getClientPreview(clientId);
  if (!preview) throw new PreviewError(404, "no_preview");
  if (preview.status === "LIVE") return { launched: true };
  if (preview.status !== "PREVIEW_READY") throw new PreviewError(400, "not_ready");

  await prisma.preview.update({ where: { id: preview.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  await writeAudit({ action: "preview.approved", entityType: "Preview", entityId: preview.id, clientId });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { isTest: true } });
  if (client?.isTest) {
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

async function alreadyNotified(clientId: string, event: string): Promise<boolean> {
  return (await prisma.notificationEvent.count({ where: { clientId, event } })) > 0;
}

/** Preview lifecycle sweep: remind before expiry, expire stale previews. Idempotent. */
export async function sweepPreviews(): Promise<{ reminded: number; expired: number }> {
  const now = Date.now();
  const previews = await prisma.preview.findMany({
    where: { status: { in: REVIEWABLE }, expiresAt: { not: null } },
  });

  let reminded = 0;
  let expired = 0;
  for (const p of previews) {
    if (!p.expiresAt || !p.clientId) continue;
    const client = await prisma.client.findUnique({ where: { id: p.clientId }, select: { ownerEmail: true } });
    const email = client?.ownerEmail;
    const msLeft = p.expiresAt.getTime() - now;

    if (msLeft <= 0) {
      await prisma.preview.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
      if (p.websiteId) {
        await prisma.website.updateMany({ where: { id: p.websiteId, status: "preview" }, data: { status: "draft" } });
      }
      if (email) {
        await sendEmail({
          to: email,
          subject: "Your website preview has expired",
          html: `<p>Your free website preview has expired. Sign in to regenerate it whenever you're ready.</p>`,
        });
      }
      expired++;
    } else {
      const daysLeft = Math.ceil(msLeft / 86_400_000);
      if (email && daysLeft <= REMIND_BEFORE && !(await alreadyNotified(p.clientId, "preview.reminder"))) {
        await sendEmail({
          to: email,
          subject: `Your website preview expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          html: `<p>Your free website preview expires soon. Approve it to launch, or request a change from your dashboard.</p>`,
        });
        await prisma.notificationEvent.create({ data: { clientId: p.clientId, event: "preview.reminder", channel: "EMAIL" } });
        reminded++;
      }
    }
  }
  return { reminded, expired };
}
