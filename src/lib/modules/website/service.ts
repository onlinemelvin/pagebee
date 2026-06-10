import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import {
  generateWebsiteConfig,
  generateSiteHtml,
  type WebsiteIntake,
  type WebsiteConfig,
  type PlanLimits,
} from "@/lib/ai/website-generator";
import type { WebsiteIntakeForm } from "./schema";

/** Days a free preview stays reviewable before it expires (see docs/ONBOARDING.md). */
export const PREVIEW_DAYS = Number(process.env.PREVIEW_DAYS ?? 14);

function generateSiteToken(): string {
  return `site_${randomBytes(16).toString("base64url")}`;
}

function planLimits(flags: Record<string, unknown>, fallbackMaxPages: number): PlanLimits {
  return {
    maxPages: Number(flags.maxPages ?? fallbackMaxPages),
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
  components.push({
    component: "ContactForm",
    props: { submitEndpoint: "/api/v1/public/leads" },
  });
  return components;
}

/**
 * Enqueue a background website generation: ensure a Website exists and create a
 * QUEUED job. Returns immediately. Call runGenerationJob(jobId) (fire-and-forget
 * or from a worker) to do the heavy Claude + Magic work — so it survives the
 * client closing their browser.
 */
export async function startGeneration(clientId: string, form: WebsiteIntakeForm) {
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

  const job = await prisma.websiteGenerationJob.create({
    data: {
      websiteId: website.id,
      status: "QUEUED",
      inputIntake: form as unknown as Prisma.InputJsonValue,
    },
  });
  return { jobId: job.id, websiteId: website.id };
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
  const form = (job.inputIntake ?? {}) as unknown as WebsiteIntakeForm;

  await prisma.websiteGenerationJob.update({
    where: { id: job.id },
    data: { status: "GENERATING", startedAt: new Date() },
  });

  try {
    const flags = (client.subscription?.plan.featureFlags ?? {}) as unknown as Record<string, unknown>;
    const limits = planLimits(flags, client.subscription?.plan.maxPages ?? 5);

    // Respect the client's opt-in choices: a feature appears on the site only if the
    // plan allows it AND the client enabled it (so the site auto-customizes too).
    const choices = await prisma.featureFlag.findMany({ where: { clientId } });
    const want = (k: string) => choices.find((c) => c.key === k)?.enabled === true;
    limits.booking = limits.booking && want("booking");
    limits.payments = limits.payments && want("invoices");

    const intake: WebsiteIntake = {
      businessName: client.businessName,
      businessType: client.businessType,
      phone: client.ownerPhone,
      email: client.ownerEmail,
      about: form.about,
      services: form.services,
      serviceAreas: form.serviceAreas,
      hours: form.hours,
      tone: form.tone,
      revisionNote: form.revisionNote,
    };

    const result = await generateWebsiteConfig(intake, limits);
    // Code-generated full site (HTML) wired to PageBee shared APIs.
    const site = await generateSiteHtml(intake, limits);

  const enabledFeatures = {
    contactForm: true,
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
  const components = buildComponents(result.config, limits);

  const last = await prisma.websiteVersion.findFirst({
    where: { websiteId: website.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const versionNo = (last?.version ?? 0) + 1;

  const version = await prisma.websiteVersion.create({
    data: {
      websiteId: website.id,
      version: versionNo,
      status: "PREVIEW",
      generatedHtml: site.html,
      config: {
        create: {
          theme: result.config.theme as unknown as Prisma.InputJsonValue,
          copy: result.config.copy as unknown as Prisma.InputJsonValue,
          enabledFeatures: enabledFeatures as Prisma.InputJsonValue,
          apiIntegrations: apiIntegrations as Prisma.InputJsonValue,
          components: components as unknown as Prisma.InputJsonValue,
          seoDefaults: {
            seoTitle: result.config.seoTitle,
            metaDescription: result.config.metaDescription,
          } as Prisma.InputJsonValue,
          adminReviewed: false,
        },
      },
      pages: {
        create: result.config.pages.map((p, i) => ({
          slug: p.slug,
          title: p.title,
          seoTitle: p.seoTitle,
          metaDescription: p.metaDescription,
          sections: p.sections as Prisma.InputJsonValue,
          order: i,
        })),
      },
    },
  });

  await prisma.websiteGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "NEEDS_REVIEW",
      output: result.config as unknown as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });

  // Preview-before-you-pay: the generated site enters PREVIEW mode (not live) for the
  // client to review/approve. It launches only after approval (+ setup-fee payment).
  // See docs/ONBOARDING.md.
  await prisma.website.update({ where: { id: website.id }, data: { status: "preview" } });
  const planName = client.subscription?.plan.name ?? "LAUNCH";
  await prisma.preview.upsert({
    where: { websiteId: website.id },
    update: { status: "PREVIEW_READY", generatedAt: new Date(), selectedPlan: planName, clientId },
    create: {
      websiteId: website.id,
      clientId,
      selectedPlan: planName,
      status: "PREVIEW_READY",
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
      engine: result.engine,
      htmlEngine: site.engine,
      version: versionNo,
    } as Prisma.InputJsonValue,
  });
  await emit("website.generated", { websiteId: website.id, versionId: version.id, clientId });
  } catch (err) {
    await prisma.websiteGenerationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: String(err), finishedAt: new Date() },
    });
    console.error("[website] generation job failed:", jobId, err);
  }
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

/** Versions awaiting admin review. */
export async function listReviewQueue() {
  return prisma.websiteVersion.findMany({
    where: { status: "PREVIEW" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { website: { include: { client: true } }, config: true },
  });
}

export async function getVersionDetail(versionId: string) {
  return prisma.websiteVersion.findUnique({
    where: { id: versionId },
    include: {
      config: true,
      pages: { orderBy: { order: "asc" } },
      website: { include: { client: true } },
    },
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

/** Resolve a renderable site (published OR in-preview) by host part, for the renderer. */
async function getServeSite(where: { subdomain?: string; domain?: string }): Promise<ServeSite | null> {
  const site = await prisma.website.findFirst({
    where: { ...where, status: { in: ["published", "preview"] } },
    include: {
      publishedVersion: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!site) return null;
  if (site.status === "published" && site.publishedVersion?.generatedHtml) {
    return { kind: "published", siteToken: site.siteToken, html: site.publishedVersion.generatedHtml };
  }
  if (site.status === "preview") {
    const html = site.versions[0]?.generatedHtml;
    if (html) return { kind: "preview", siteToken: site.siteToken, html };
  }
  return null;
}

export function getServeSiteBySubdomain(subdomain: string) {
  return getServeSite({ subdomain });
}
export function getServeSiteByDomain(domain: string) {
  return getServeSite({ domain });
}

/** The client's website with its latest version + published state. */
export async function getClientWebsite(clientId: string) {
  return prisma.website.findFirst({
    where: { clientId },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1, include: { config: true } },
      publishedVersion: true,
    },
  });
}
