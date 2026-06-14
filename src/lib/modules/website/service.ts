import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { compileChangeRequest, markResolved } from "@/lib/modules/review";
import { emit } from "@/lib/events";
import {
  generateWebsiteConfig,
  generateSiteHtml,
  editSiteHtml,
  type WebsiteIntake,
  type WebsiteConfig,
  type PlanLimits,
  type HtmlEditRequest,
} from "@/lib/ai/website-generator";
import { recompileTailwind } from "@/lib/site/tailwind";
import { getUpdateQuota, type UpdateQuota } from "@/lib/modules/subscription";
import { seedServicesFromNames, listWebsiteServices } from "@/lib/modules/service";
import type { WebsiteIntakeForm } from "./schema";

/** Stored generation input: the client intake plus revision context the client never sends
 *  directly — the revision note and the structured pins that drive surgical HTML editing. */
export type GenerationForm = WebsiteIntakeForm & { revisionEdits?: HtmlEditRequest[] };

/** Days a free preview stays reviewable before it expires (see docs/ONBOARDING.md). */
export const PREVIEW_DAYS = Number(process.env.PREVIEW_DAYS ?? 14);

function generateSiteToken(): string {
  return `site_${randomBytes(16).toString("base64url")}`;
}

/** Turn the structured weekly hours into a readable line for the generator. */
function formatBusinessHours(
  hours?: { day: string; closed?: boolean; open?: string; close?: string }[],
): string | undefined {
  if (!hours?.length) return undefined;
  const parts = hours.map((h) =>
    h.closed || !h.open ? `${h.day}: closed` : `${h.day}: ${h.open}–${h.close ?? ""}`,
  );
  return parts.join(", ");
}

function planLimits(flags: Record<string, unknown>, fallbackMaxPages: number): PlanLimits {
  return {
    maxPages: Number(flags.maxPages ?? fallbackMaxPages),
    forms: Boolean(flags.contactForm),
    booking: Boolean(flags.booking),
    chat: Boolean(flags.chat),
    payments: Boolean(flags.payments),
    aiAssistant: Boolean(flags.aiAssistant),
  };
}

/** Build the ordered component list for the renderer from the config + enabled features. */
function buildComponents(config: WebsiteConfig, limits: PlanLimits) {
  const components: Array<{ component: string; props?: Record<string, unknown> }> = [
    {
      component: "Hero",
      props: {
        headline: config.copy.heroHeadline,
        subheadline: config.copy.heroSubheadline,
        ctaText: config.copy.ctaText,
      },
    },
    { component: "Services", props: { services: config.copy.services } },
    { component: "About", props: { text: config.copy.aboutText } },
  ];
  if (limits.booking) components.push({ component: "BookingWidget" });
  if (config.copy.faqs.length) components.push({ component: "FAQ", props: { faqs: config.copy.faqs } });
  if (limits.chat) components.push({ component: "ChatWidget" });
  // Launch (no forms) shows contact details only; no lead-capture form component.
  if (limits.forms) {
    components.push({
      component: "ContactForm",
      props: { submitEndpoint: "/api/v1/public/leads" },
    });
  }
  return components;
}

/**
 * Enqueue a background website generation: ensure a Website exists and create a
 * QUEUED job. Returns immediately. Call runGenerationJob(jobId) (fire-and-forget
 * or from a worker) to do the heavy Claude + Magic work — so it survives the
 * client closing their browser.
 */
export async function startGeneration(clientId: string, form: GenerationForm) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { websites: true },
  });
  if (!client) throw new Error("client_not_found");

  let website = client.websites[0];
  if (!website) {
    website = await prisma.website.create({
      data: { clientId, siteToken: generateSiteToken(), subdomain: client.slug, status: "draft" },
    });
  }

  // Populate the central service catalog from the intake the first time (idempotent — skipped
  // once the client has a real catalog), so the site and the scheduler share one source of truth.
  await seedServicesFromNames(clientId, form.services ?? []);

  const job = await prisma.websiteGenerationJob.create({
    data: {
      websiteId: website.id,
      status: "QUEUED",
      inputIntake: form as unknown as Prisma.InputJsonValue,
    },
  });
  // Audit + admin visibility from the very moment a build is requested (before any AI runs).
  await writeAudit({
    action: "website.generation_requested",
    entityType: "WebsiteGenerationJob",
    entityId: job.id,
    clientId,
  });
  return { jobId: job.id, websiteId: website.id };
}

/** Live progress for a running job, stored in `output` until the final config replaces it.
 *  Best-effort: a progress write must never fail the generation. */
async function setJobStage(jobId: string, percent: number, stage: string): Promise<void> {
  await prisma.websiteGenerationJob
    .update({ where: { id: jobId }, data: { output: { stage, percent } as Prisma.InputJsonValue } })
    .catch(() => {});
}

/** Latest generation job for a client's website — for status polling. */
export async function getLatestJobStatus(clientId: string) {
  return prisma.websiteGenerationJob.findFirst({
    where: { website: { clientId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, error: true, createdAt: true },
  });
}

/**
 * Process a queued generation job (heavy: Claude + Magic). Drives the job through
 * GENERATING → NEEDS_REVIEW (or FAILED). Never throws — safe to run fire-and-forget.
 */
export async function runGenerationJob(jobId: string): Promise<void> {
  const job = await prisma.websiteGenerationJob.findUnique({
    where: { id: jobId },
    include: {
      website: { include: { client: { include: { subscription: { include: { plan: true } } } } } },
    },
  });
  if (!job) throw new Error("job_not_found");

  const website = job.website;
  const client = website.client;
  const clientId = client.id;
  const form = (job.inputIntake ?? {}) as unknown as GenerationForm;

  await prisma.websiteGenerationJob.update({
    where: { id: job.id },
    data: { status: "GENERATING", startedAt: new Date() },
  });
  await setJobStage(job.id, 8, "Preparing your details");

  try {
    const flags = (client.subscription?.plan.featureFlags ?? {}) as unknown as Record<string, unknown>;
    const limits = planLimits(flags, client.subscription?.plan.maxPages ?? 5);

    // Per-client feature overrides (mirrors the dashboard cards): lead capture is on by default
    // (tier 2+) unless turned off; booking / payments are explicit opt-ins (off until enabled).
    const overrides = await prisma.featureFlag.findMany({ where: { clientId } });
    const notDisabled = (k: string) => overrides.find((c) => c.key === k)?.enabled !== false;
    const isEnabled = (k: string) => overrides.find((c) => c.key === k)?.enabled === true;
    limits.forms = limits.forms && notDisabled("contactForm");
    limits.booking = limits.booking && isEnabled("booking");
    limits.payments = limits.payments && isEnabled("invoices");

    // Photo gallery follows the owner's choice: shown when they supplied gallery photos and haven't
    // turned it off. Persist the resulting state so the dashboard card reflects the creation choice.
    const galleryDisabled = overrides.find((c) => c.key === "gallery")?.enabled === false;
    const useGallery = !galleryDisabled && Boolean(form.galleryImageUrls?.length);
    await prisma.featureFlag.upsert({
      where: { clientId_key: { clientId, key: "gallery" } },
      update: { enabled: useGallery },
      create: { clientId, key: "gallery", enabled: useGallery },
    });

    // Services shown on the site come from the central catalog (visible ones, excluding "Other");
    // fall back to the raw intake names if the catalog is somehow empty.
    const websiteServices = await listWebsiteServices(clientId);
    const services = websiteServices.length ? websiteServices.map((s) => s.title) : form.services;

    const intake: WebsiteIntake = {
      businessName: client.businessName,
      businessType: client.businessType,
      // Contact section: the owner's confirmed/edited values take precedence over registration.
      phone: form.contact?.phone || client.ownerPhone,
      email: form.contact?.email || client.ownerEmail,
      address: form.contact?.address || undefined,
      pricing: form.pricing,
      faqs: form.faqs,
      team: form.team,
      about: form.about,
      services,
      serviceAreas: form.serviceAreas,
      hours: formatBusinessHours(form.businessHours),
      tone: form.tone,
      colorPalette: form.colorPalette,
      pages: form.pages,
      logoUrl: form.logoUrl,
      imageUrls: form.imageUrls,
      galleryImageUrls: useGallery ? form.galleryImageUrls : [],
      customInstructions: form.customInstructions,
      revisionNote: form.revisionNote,
      primaryGoal: form.primaryGoal,
    };

    // A revision carrying pinned edits + an existing draft → surgically edit that draft so ONLY
    // the pinned elements change. Otherwise (first build, or no usable previous HTML) → full gen.
    const prev = await prisma.websiteVersion.findFirst({
      where: { websiteId: website.id },
      orderBy: { version: "desc" },
      include: { config: true, pages: { orderBy: { order: "asc" } } },
    });
    const edits = form.revisionEdits ?? [];
    const surgical =
      edits.length > 0 && Boolean(prev?.generatedHtml) && Boolean(process.env.ANTHROPIC_API_KEY);

    const enabledFeatures = {
      contactForm: limits.forms,
      booking: limits.booking,
      chat: limits.chat,
      payments: limits.payments,
      aiAssistant: limits.aiAssistant,
    };
    const apiIntegrations = {
      leadApi: true,
      analyticsApi: true,
      bookingApi: limits.booking,
      chatApi: limits.chat,
      paymentApi: limits.payments,
      aiApi: limits.aiAssistant,
    };

    let generatedHtml: string;
    let htmlEngine: string;
    let configEngine: string;
    let appliedEdits: number | null = null;
    let configCreate: Prisma.WebsiteConfigCreateWithoutVersionInput;
    let pagesCreate: Prisma.WebsitePageCreateWithoutVersionInput[];
    let jobOutput: Prisma.InputJsonValue;

    if (surgical && prev) {
      await setJobStage(job.id, 45, "Applying your requested changes");
      const edited = await editSiteHtml(prev.generatedHtml as string, edits, limits);
      generatedHtml = edited.html;
      htmlEngine = edited.engine;
      configEngine = "carried-forward";
      appliedEdits = edited.applied;
      // Carry the previous version's config + pages forward unchanged — only the HTML's pinned
      // elements were touched; copy, theme, components, and pages stay exactly as approved.
      const pc = prev.config;
      configCreate = {
        theme: (pc?.theme ?? {}) as Prisma.InputJsonValue,
        copy: (pc?.copy ?? {}) as Prisma.InputJsonValue,
        enabledFeatures: enabledFeatures as Prisma.InputJsonValue,
        apiIntegrations: apiIntegrations as Prisma.InputJsonValue,
        components: (pc?.components ?? []) as Prisma.InputJsonValue,
        seoDefaults: (pc?.seoDefaults ?? {}) as Prisma.InputJsonValue,
        adminReviewed: false,
      };
      pagesCreate = prev.pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        seoTitle: p.seoTitle ?? undefined,
        metaDescription: p.metaDescription ?? undefined,
        sections: (p.sections ?? []) as Prisma.InputJsonValue,
        order: p.order,
      }));
      jobOutput = (pc?.copy ?? {}) as Prisma.InputJsonValue;
    } else {
      await setJobStage(job.id, 25, "Writing your website content");
      const result = await generateWebsiteConfig(intake, limits);
      // Code-generated full site (HTML) wired to PageBee shared APIs.
      await setJobStage(job.id, 55, "Designing and building your pages");
      const site = await generateSiteHtml(intake, limits);
      generatedHtml = site.html;
      htmlEngine = site.engine;
      configEngine = result.engine;
      configCreate = {
        theme: result.config.theme as unknown as Prisma.InputJsonValue,
        copy: result.config.copy as unknown as Prisma.InputJsonValue,
        enabledFeatures: enabledFeatures as Prisma.InputJsonValue,
        apiIntegrations: apiIntegrations as Prisma.InputJsonValue,
        components: buildComponents(result.config, limits) as unknown as Prisma.InputJsonValue,
        seoDefaults: {
          seoTitle: result.config.seoTitle,
          metaDescription: result.config.metaDescription,
        } as Prisma.InputJsonValue,
        adminReviewed: false,
      };
      pagesCreate = result.config.pages.map((p, i) => ({
        slug: p.slug,
        title: p.title,
        seoTitle: p.seoTitle,
        metaDescription: p.metaDescription,
        sections: p.sections as Prisma.InputJsonValue,
        order: i,
      }));
      jobOutput = result.config as unknown as Prisma.InputJsonValue;
    }

    await setJobStage(job.id, 90, "Finalizing your preview");
    const versionNo = (prev?.version ?? 0) + 1;

    const version = await prisma.websiteVersion.create({
      data: {
        websiteId: website.id,
        version: versionNo,
        status: "PREVIEW",
        generatedHtml,
        config: { create: configCreate },
        pages: { create: pagesCreate },
      },
    });

    await prisma.websiteGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "NEEDS_REVIEW",
        output: jobOutput,
        finishedAt: new Date(),
      },
    });

  // Preview-before-you-pay: the generated site enters PREVIEW mode (not live). It first
  // goes to IN_REVIEW — a platform reviewer must release it before the client can see it
  // (the client just sees "we're setting up your website"). It launches only after the
  // client approves (+ setup-fee payment). See docs/ONBOARDING.md.
  await prisma.website.update({ where: { id: website.id }, data: { status: "preview" } });
  const planName = client.subscription?.plan.name ?? "LAUNCH";
  await prisma.preview.upsert({
    where: { websiteId: website.id },
    update: { status: "IN_REVIEW", generatedAt: new Date(), selectedPlan: planName, clientId },
    create: {
      websiteId: website.id,
      clientId,
      selectedPlan: planName,
      status: "IN_REVIEW",
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + PREVIEW_DAYS * 86_400_000),
    },
  });

  await writeAudit({
    action: "website.generated",
    entityType: "WebsiteVersion",
    entityId: version.id,
    clientId,
    metadata: {
      engine: configEngine,
      htmlEngine,
      version: versionNo,
      surgicalEdits: appliedEdits,
    } as Prisma.InputJsonValue,
  });
  await emit("website.generated", { websiteId: website.id, versionId: version.id, clientId });
  } catch (err) {
    await prisma.websiteGenerationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: String(err), finishedAt: new Date() },
    });
    // Surface the failure in the audit trail so the admin sees it (not just a silent dead job).
    await writeAudit({
      action: "website.generation_failed",
      entityType: "WebsiteGenerationJob",
      entityId: job.id,
      clientId,
      metadata: { error: String(err).slice(0, 500) } as Prisma.InputJsonValue,
    }).catch(() => {});
    console.error("[website] generation job failed:", jobId, err);
  }
}

/** In-flight (queued/generating) and recently-failed generation jobs — admin activity view. */
export async function listGenerationActivity() {
  const failedSince = new Date(Date.now() - 3 * 86_400_000); // keep failures visible for 3 days
  return prisma.websiteGenerationJob.findMany({
    where: {
      OR: [
        { status: { in: ["QUEUED", "GENERATING"] } },
        { status: "FAILED", createdAt: { gte: failedSince } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      website: { select: { id: true, subdomain: true, client: { select: { businessName: true } } } },
    },
  });
}

/** Retry a failed (or stuck) generation job: requeue it and re-run. */
export async function retryGenerationJob(jobId: string, actorId: string | null) {
  const job = await prisma.websiteGenerationJob.findUnique({
    where: { id: jobId },
    include: { website: { select: { clientId: true } } },
  });
  if (!job) throw new Error("job_not_found");
  await prisma.websiteGenerationJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      error: null,
      startedAt: null,
      finishedAt: null,
      output: { stage: "Queued", percent: 0 } as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    action: "website.generation_retried",
    entityType: "WebsiteGenerationJob",
    entityId: jobId,
    clientId: job.website.clientId,
    actorId,
  });
  void claimAndRun(jobId).catch((e) => console.error("[website] retry job failed", jobId, e));
  return { ok: true as const };
}

/** Atomically claim a specific QUEUED job and process it (inline trigger from the API). */
export async function claimAndRun(jobId: string): Promise<void> {
  const claimed = await prisma.websiteGenerationJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: { status: "GENERATING", startedAt: new Date() },
  });
  if (claimed.count !== 1) return; // already claimed by the worker
  await runGenerationJob(jobId);
}

/** Atomically claim the oldest QUEUED job; returns its id (used by the background worker). */
export async function claimNextQueuedJob(): Promise<string | null> {
  const next = await prisma.websiteGenerationJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!next) return null;
  const claimed = await prisma.websiteGenerationJob.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "GENERATING", startedAt: new Date() },
  });
  return claimed.count === 1 ? next.id : null;
}

/** Requeue jobs stuck in GENERATING (e.g. a crashed worker) older than the cutoff. */
export async function requeueStaleJobs(olderThanMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await prisma.websiteGenerationJob.updateMany({
    where: { status: "GENERATING", startedAt: { lt: cutoff } },
    data: { status: "QUEUED" },
  });
  return res.count;
}

/**
 * Reviewer-initiated revision: compile the open change-request pins on a version into a
 * single instruction and regenerate (a NEW version re-enters the review queue). Does NOT
 * consume the client's free revisions — this is platform-side review, not the client's. The
 * bundled comments are marked resolved once queued. Returns the new job id + how many folded in.
 */
export async function requestReviewChanges(versionId: string, actorId: string | null) {
  const version = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    include: { website: { select: { id: true, clientId: true } } },
  });
  if (!version) throw new Error("version_not_found");

  const { note, commentIds, edits } = await compileChangeRequest(versionId);
  if (!commentIds.length) return { ok: false as const, count: 0, reason: "no_open_change_requests" };

  const websiteId = version.website.id;
  const clientId = version.website.clientId;
  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { websiteId },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  const base = (lastJob?.inputIntake ?? {}) as Record<string, unknown>;
  const form = { ...base, revisionNote: note, revisionEdits: edits } as GenerationForm;

  // Surface "building…" on the client dashboard while it regenerates, and log the request.
  await prisma.preview.updateMany({
    where: { websiteId },
    data: { status: "PREVIEW_GENERATING" },
  });
  await prisma.preview
    .findFirst({ where: { websiteId }, select: { id: true } })
    .then((p) =>
      p
        ? prisma.previewRevision.create({
            data: { previewId: p.id, requestedBy: actorId ?? "reviewer", requestText: note, status: "in_progress" },
          })
        : null,
    );

  const { jobId } = await startGeneration(clientId, form);
  void claimAndRun(jobId).catch((e) => console.error("[website] review-changes job failed", jobId, e));
  await markResolved(commentIds, actorId);
  await writeAudit({
    action: "website.review_changes_requested",
    entityType: "WebsiteVersion",
    entityId: versionId,
    clientId,
    actorId,
    metadata: { count: commentIds.length } as Prisma.InputJsonValue,
  });
  return { ok: true as const, count: commentIds.length, jobId };
}

/**
 * Client-initiated update to a LIVE site. Quota-gated (one of the plan's monthly updates),
 * then runs the SAME surgical-edit + review pipeline as a preview revision — the new version
 * enters the review queue and the admin republishes it. Returns `out_of_updates` (with the
 * quota) so the UI can show the tier upsell instead of generating.
 */
export async function requestWebsiteUpdate(clientId: string, note?: string) {
  const website = await prisma.website.findFirst({
    where: { clientId, status: "published", publishedVersionId: { not: null } },
    select: { id: true, publishedVersionId: true },
  });
  if (!website?.publishedVersionId) return { ok: false as const, reason: "no_live_site" as const };

  const quota = await getUpdateQuota(clientId);
  if (quota.remaining <= 0) return { ok: false as const, reason: "out_of_updates" as const, quota };

  // Pins the client placed on the live site + the typed note → surgical edits (same as revisions).
  const pins = await compileChangeRequest(website.publishedVersionId);
  const combined = [note?.trim(), pins.note].filter(Boolean).join("\n\n");
  if (!combined) return { ok: false as const, reason: "no_content" as const, quota };

  const revisionEdits = [...pins.edits];
  const typed = note?.trim();
  if (typed) revisionEdits.push({ pagePath: "", selector: null, anchorText: null, instruction: typed });

  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { websiteId: website.id },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  const base = (lastJob?.inputIntake ?? {}) as Record<string, unknown>;
  const form = { ...base, revisionNote: combined, revisionEdits } as GenerationForm;

  // Record the update (this is what consumes the monthly quota) + kick off generation.
  const update = await prisma.websiteUpdate.create({
    data: { clientId, websiteId: website.id, note: combined, status: "in_review" },
  });
  const { jobId } = await startGeneration(clientId, form);
  void claimAndRun(jobId).catch((e) => console.error("[website] update job failed", jobId, e));
  if (pins.commentIds.length) await markResolved(pins.commentIds, null);
  await writeAudit({
    action: "website.update_requested",
    entityType: "WebsiteUpdate",
    entityId: update.id,
    clientId,
  });
  return { ok: true as const, updateId: update.id };
}

/**
 * Quota gate for a full "regenerate from scratch" of an ALREADY-LIVE site — a major change that,
 * like a minor update, consumes one of the plan's monthly updates. First-time generation and
 * pre-launch preview regenerations are free (no published site yet), so they pass through.
 * Consumes the quota (records a WebsiteUpdate) when it returns ok.
 */
export async function gateRegenQuota(
  clientId: string,
): Promise<{ ok: true } | { ok: false; reason: "out_of_updates"; quota: UpdateQuota }> {
  const published = await prisma.website.findFirst({
    where: { clientId, status: "published" },
    select: { id: true },
  });
  if (!published) return { ok: true }; // first build / pre-launch regen → free
  const quota = await getUpdateQuota(clientId);
  if (quota.remaining <= 0) return { ok: false, reason: "out_of_updates", quota };
  await prisma.websiteUpdate.create({
    data: { clientId, websiteId: published.id, note: "Full website regeneration", status: "in_review" },
  });
  return { ok: true };
}

/** Mark the client's most recent in-review live-site update as published (on republish). */
async function markUpdatePublished(clientId: string): Promise<void> {
  const latest = await prisma.websiteUpdate.findFirst({
    where: { clientId, status: "in_review" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest) await prisma.websiteUpdate.update({ where: { id: latest.id }, data: { status: "published" } });
}

/**
 * Publish an approved update to an ALREADY-LIVE site (admin action). Unlike initial launch
 * (client-approved + paid), an update to a paying customer's live site republishes directly.
 * Guarded to published sites so it can never bypass the initial launch/payment flow.
 */
export async function publishUpdate(versionId: string, reviewerId: string | null = null) {
  const version = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    include: { website: { select: { clientId: true, status: true } } },
  });
  if (!version) throw new Error("version_not_found");
  if (version.website.status !== "published") throw new Error("not_a_live_update");
  await approveAndPublish(versionId, reviewerId); // repoints publishedVersionId at this version
  await markUpdatePublished(version.website.clientId);
}

/** Versions awaiting admin review. Narrow select — never pull the ~60KB generatedHtml here. */
export async function listReviewQueue() {
  return prisma.websiteVersion.findMany({
    where: { status: "PREVIEW" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      version: true,
      createdAt: true,
      website: { select: { client: { select: { businessName: true } } } },
      config: { select: { adminReviewed: true } },
    },
  });
}

/** Version metadata for the admin detail/review pages. Excludes generatedHtml (fetched lazily
 *  via getVersionRawHtml only when the manual editor is opened). */
export async function getVersionDetail(versionId: string) {
  return prisma.websiteVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      version: true,
      status: true,
      config: { select: { adminReviewed: true } },
      website: {
        select: { id: true, status: true, subdomain: true, client: { select: { businessName: true } } },
      },
    },
  });
}

/** The raw generated HTML for one version — loaded on demand (manual editor), not on page render. */
export async function getVersionRawHtml(versionId: string): Promise<string | null> {
  const v = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    select: { generatedHtml: true },
  });
  return v?.generatedHtml ?? null;
}

/** All versions of a website, newest first — for the admin version history / revert UI. */
export async function listWebsiteVersions(websiteId: string) {
  return prisma.websiteVersion.findMany({
    where: { websiteId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      config: { select: { adminReviewed: true } },
    },
  });
}

type VersionSnapshotSource = Prisma.WebsiteVersionGetPayload<{
  include: { config: true; pages: true; website: { select: { id: true; clientId: true } } };
}>;

/**
 * Snapshot an existing version into a NEW version with possibly-different HTML. Forward-only:
 * nothing is overwritten, so every prior version stays intact and revertable. The new version
 * re-enters review (status PREVIEW, not admin-reviewed) so it must be released again.
 */
async function snapshotNewVersion(
  src: VersionSnapshotSource,
  html: string,
  action: string,
  actorId: string | null,
): Promise<{ id: string; version: number }> {
  const websiteId = src.website.id;
  const last = await prisma.websiteVersion.findFirst({
    where: { websiteId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const versionNo = (last?.version ?? 0) + 1;
  const pc = src.config;
  const version = await prisma.websiteVersion.create({
    data: {
      websiteId,
      version: versionNo,
      status: "PREVIEW",
      generatedHtml: html,
      config: {
        create: {
          theme: (pc?.theme ?? {}) as Prisma.InputJsonValue,
          copy: (pc?.copy ?? {}) as Prisma.InputJsonValue,
          enabledFeatures: (pc?.enabledFeatures ?? {}) as Prisma.InputJsonValue,
          apiIntegrations: (pc?.apiIntegrations ?? {}) as Prisma.InputJsonValue,
          components: (pc?.components ?? []) as Prisma.InputJsonValue,
          seoDefaults: (pc?.seoDefaults ?? {}) as Prisma.InputJsonValue,
          adminReviewed: false,
        },
      },
      pages: {
        create: src.pages.map((p) => ({
          slug: p.slug,
          title: p.title,
          seoTitle: p.seoTitle ?? undefined,
          metaDescription: p.metaDescription ?? undefined,
          sections: (p.sections ?? []) as Prisma.InputJsonValue,
          order: p.order,
        })),
      },
    },
    select: { id: true, version: true },
  });
  // A new latest version isn't reviewed yet → put the client back into the holding state (same as
  // a fresh generation) so they don't see a stale "preview ready" until it's released again.
  await prisma.preview.updateMany({ where: { websiteId }, data: { status: "IN_REVIEW" } });
  await writeAudit({
    action,
    entityType: "WebsiteVersion",
    entityId: version.id,
    clientId: src.website.clientId,
    actorId,
    metadata: { fromVersion: src.version, version: versionNo } as Prisma.InputJsonValue,
  });
  return version;
}

const snapshotInclude = {
  config: true,
  pages: { orderBy: { order: "asc" as const } },
  website: { select: { id: true, clientId: true } },
} satisfies Prisma.WebsiteVersionInclude;

/** Save an admin's manual HTML edit as a NEW version (Tailwind recompiled to cover new classes). */
export async function saveManualEdit(versionId: string, rawHtml: string, actorId: string | null) {
  const src = await prisma.websiteVersion.findUnique({ where: { id: versionId }, include: snapshotInclude });
  if (!src) throw new Error("version_not_found");
  // Recompiling Tailwind is best-effort: the native compiler may be unavailable in some runtimes,
  // so never let it block saving the edit — fall back to the raw HTML (its existing precompiled
  // <style> still covers all pre-existing classes).
  let html = rawHtml;
  try {
    html = await recompileTailwind(rawHtml);
  } catch (err) {
    console.error("[saveManualEdit] tailwind recompile failed; saving raw HTML", err);
  }
  return snapshotNewVersion(src, html, "website.manual_edit", actorId);
}

/** Revert to an earlier version by snapshotting its EXACT html/config/pages into a new version. */
export async function revertToVersion(versionId: string, actorId: string | null) {
  const src = await prisma.websiteVersion.findUnique({ where: { id: versionId }, include: snapshotInclude });
  if (!src?.generatedHtml) throw new Error("version_not_found");
  return snapshotNewVersion(src, src.generatedHtml, "website.reverted", actorId);
}

/** The rendered HTML + site token + tenant for a version — for the review iframe. */
export async function getVersionFrameData(versionId: string) {
  const version = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    select: {
      generatedHtml: true,
      website: { select: { siteToken: true, clientId: true } },
    },
  });
  if (!version?.generatedHtml || !version.website) return null;
  return {
    html: version.generatedHtml,
    siteToken: version.website.siteToken,
    clientId: version.website.clientId,
  };
}

/**
 * Release a reviewed draft to the client. Until this runs the client only sees a
 * "we're setting up your website" holding state; afterwards the preview becomes visible
 * for them to review/approve. Marks the version admin-reviewed and flips the Preview to
 * PREVIEW_READY. Does NOT publish the site live (that's approveAndPublish / client pay).
 */
export async function releaseToClient(versionId: string, reviewerId: string | null = null) {
  const version = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    include: {
      website: {
        select: {
          id: true,
          clientId: true,
          client: { select: { subscription: { select: { plan: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!version) throw new Error("version_not_found");

  const websiteId = version.website.id;
  const clientId = version.website.clientId;
  const planName = version.website.client.subscription?.plan.name ?? "LAUNCH";

  await prisma.$transaction([
    prisma.websiteConfig.update({
      where: { versionId },
      data: { adminReviewed: true, reviewedById: reviewerId, reviewedAt: new Date() },
    }),
    // Upsert (not updateMany): release must reliably leave a PREVIEW_READY preview the client can
    // view/approve, even if a Preview row was never created for this site.
    prisma.preview.upsert({
      where: { websiteId },
      update: { status: "PREVIEW_READY", generatedAt: new Date() },
      create: {
        websiteId,
        clientId,
        selectedPlan: planName,
        status: "PREVIEW_READY",
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + PREVIEW_DAYS * 86_400_000),
      },
    }),
  ]);

  await writeAudit({
    action: "website.preview_released",
    entityType: "WebsiteVersion",
    entityId: versionId,
    clientId: version.website.clientId,
    actorId: reviewerId,
  });
  await emit("website.preview_released", {
    websiteId: version.website.id,
    versionId,
    clientId: version.website.clientId,
  });
}

/** Approve a generated version and publish it as the live site version. reviewerId is null for auto-publish. */
export async function approveAndPublish(versionId: string, reviewerId: string | null = null) {
  const version = await prisma.websiteVersion.findUnique({
    where: { id: versionId },
    include: { website: true },
  });
  if (!version) throw new Error("version_not_found");

  await prisma.$transaction([
    prisma.websiteConfig.update({
      where: { versionId },
      data: { adminReviewed: true, reviewedById: reviewerId, reviewedAt: new Date() },
    }),
    prisma.websiteVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } }),
    prisma.website.update({
      where: { id: version.websiteId },
      data: { publishedVersionId: versionId, status: "published" },
    }),
  ]);

  await writeAudit({
    action: "website.published",
    entityType: "WebsiteVersion",
    entityId: versionId,
    clientId: version.website.clientId,
    actorId: reviewerId,
  });
}

const publishedInclude = {
  client: true,
  publishedVersion: { include: { config: true, pages: { orderBy: { order: "asc" as const } } } },
};

/** A live (published) site resolved by subdomain — for the public renderer. */
export async function getPublishedSiteBySubdomain(subdomain: string) {
  return prisma.website.findFirst({
    where: { subdomain, status: "published", publishedVersionId: { not: null } },
    include: publishedInclude,
  });
}

/** A live (published) site resolved by custom domain. */
export async function getPublishedSiteByDomain(domain: string) {
  return prisma.website.findFirst({
    where: { domain, status: "published", publishedVersionId: { not: null } },
    include: publishedInclude,
  });
}

export type PublishedSite = NonNullable<Awaited<ReturnType<typeof getPublishedSiteBySubdomain>>>;

export interface ServeSite {
  kind: "published" | "preview";
  siteToken: string;
  html: string;
}

/** Resolve a PUBLISHED site by host part, for the public renderer. Previews are NOT
 *  served on the public host — they're only viewable by the signed-in owner at /preview. */
async function getServeSite(where: { subdomain?: string; domain?: string }): Promise<ServeSite | null> {
  const site = await prisma.website.findFirst({
    where: { ...where, status: "published", publishedVersionId: { not: null } },
    include: { publishedVersion: true },
  });
  const html = site?.publishedVersion?.generatedHtml;
  if (!site || !html) return null;
  return { kind: "published", siteToken: site.siteToken, html };
}

export function getServeSiteBySubdomain(subdomain: string) {
  return getServeSite({ subdomain });
}
export function getServeSiteByDomain(domain: string) {
  return getServeSite({ domain });
}

/** The in-preview site for a signed-in client — for the authenticated /preview route only.
 *  Gated on platform review: the client can't see the preview until an admin has released
 *  it (config.adminReviewed), even if they navigate straight to /preview. */
export async function getPreviewSiteForClient(clientId: string): Promise<ServeSite | null> {
  const site = await prisma.website.findFirst({
    where: { clientId, status: "preview" },
    select: {
      siteToken: true,
      // The latest RELEASED version — so a pending (unreleased) revision keeps showing the last
      // approved preview instead of hiding it ("Coming soon").
      versions: {
        where: { config: { adminReviewed: true } },
        orderBy: { version: "desc" },
        take: 1,
        select: { generatedHtml: true },
      },
    },
  });
  const html = site?.versions[0]?.generatedHtml;
  if (!site || !html) return null;
  return { kind: "preview", siteToken: site.siteToken, html };
}

/** The client's website with its latest version's metadata. Narrow select — no generatedHtml. */
export async function getClientWebsite(clientId: string) {
  return prisma.website.findFirst({
    where: { clientId },
    select: {
      status: true,
      subdomain: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          version: true,
          status: true,
          config: { select: { copy: true } },
        },
      },
    },
  });
}
