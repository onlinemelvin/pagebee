import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import {
  generateWebsiteConfig,
  type WebsiteIntake,
  type WebsiteConfig,
  type PlanLimits,
} from "@/lib/ai/website-generator";
import type { WebsiteIntakeForm } from "./schema";

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
 * Generate (or regenerate) a website for a client from intake. Produces a new
 * PREVIEW version with config + pages, awaiting admin review before publish.
 */
export async function generateForClient(clientId: string, form: WebsiteIntakeForm) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { subscription: { include: { plan: true } }, websites: true },
  });
  if (!client) throw new Error("client_not_found");

  const flags = (client.subscription?.plan.featureFlags ?? {}) as unknown as Record<string, unknown>;
  const limits = planLimits(flags, client.subscription?.plan.maxPages ?? 5);

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
  };

  let website = client.websites[0];
  if (!website) {
    website = await prisma.website.create({
      data: { clientId, siteToken: generateSiteToken(), subdomain: client.slug, status: "draft" },
    });
  }

  const job = await prisma.websiteGenerationJob.create({
    data: {
      websiteId: website.id,
      status: "GENERATING",
      inputIntake: intake as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });

  let result;
  try {
    result = await generateWebsiteConfig(intake, limits);
  } catch (err) {
    await prisma.websiteGenerationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: String(err), finishedAt: new Date() },
    });
    throw err;
  }

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

  await writeAudit({
    action: "website.generated",
    entityType: "WebsiteVersion",
    entityId: version.id,
    clientId,
    metadata: { engine: result.engine, version: versionNo } as Prisma.InputJsonValue,
  });
  await emit("website.generated", { websiteId: website.id, versionId: version.id, clientId });

  return { websiteId: website.id, versionId: version.id, version: versionNo, engine: result.engine };
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

/** Approve a generated version and publish it as the live site version. */
export async function approveAndPublish(versionId: string, reviewerId: string) {
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
