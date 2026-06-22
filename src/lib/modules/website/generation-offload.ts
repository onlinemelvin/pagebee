import { prisma } from "@/lib/db";
import type { Prisma, PlanName } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import {
  generateWebsiteConfig,
  prepareHtmlPrompt,
  finalizeHtmlFromText,
  markNoGallery,
  htmlPromptDebug,
  type WebsiteIntake,
  type PlanLimits,
  type BuiltHtmlPrompt,
} from "@/lib/ai/website-generator";
import { AI_FORCE_STUB } from "@/lib/ai/models";
import { inlineTailwind } from "@/lib/site/tailwind";
import { splitLeadForm } from "@/lib/site/lead-form";
import { splitBookingSection } from "@/lib/site/booking";
import { isLeadGoal } from "@/lib/site/lead-goals";
import { listWebsiteServices, serviceDurationLabel } from "@/lib/modules/service";
import { planLimits, buildComponents, formatBusinessHours, runGenerationJob, type GenerationForm } from "./service";

/**
 * VERCEL-SAFE GENERATION OFFLOAD.
 *
 * The HTML generation call streams up to 32k tokens and runs 1–2 minutes — past Vercel's 60s
 * function cap. So on Vercel we split a generation into three hops:
 *   1. prepareGeneration  (Vercel, <60s): plan/intake resolution + the short config call + image
 *      prep, then store the built HTML prompt on the job and hand off to the edge function.
 *   2. Supabase Edge Function (≤150s): runs ONLY the long Anthropic call, writes `llmResult`.
 *   3. finalizeGeneration (Vercel, <60s): assemble the WebsiteVersion from the completion.
 *
 * IMPORTANT: the prepare/finalize logic below MIRRORS the FULL-GENERATION branch of
 * runGenerationJob() in service.ts (the worker/local path). Keep the two in sync. Surgical edits
 * (revisions) are NOT offloaded yet — they still run inline via the worker; on Vercel they should
 * be routed here too in a follow-up.
 */

const jobInclude = {
  website: { include: { client: { include: { subscription: { include: { plan: true } } } } } },
} satisfies Prisma.WebsiteGenerationJobInclude;
type GenerationJob = Prisma.WebsiteGenerationJobGetPayload<{ include: typeof jobInclude }>;

/** Phase-1 outputs persisted on the job for finalize to assemble the version. */
interface Prepared {
  intake: WebsiteIntake; // for markNoGallery
  configCreate: Prisma.WebsiteConfigCreateWithoutVersionInput;
  pagesCreate: Prisma.WebsitePageCreateWithoutVersionInput[];
  jobOutput: Prisma.InputJsonValue;
  planName: PlanName;
  configEngine: string;
  htmlPrompt: ReturnType<typeof htmlPromptDebug>;
}

/** Resolve plan limits, per-client overrides, and the generator intake from a loaded job.
 *  Mirrors runGenerationJob lines for flags/gallery/services/intake. */
async function resolveInputs(job: GenerationJob) {
  const client = job.website.client;
  const clientId = client.id;
  const form = (job.inputIntake ?? {}) as unknown as GenerationForm;

  const flags = (client.subscription?.plan.featureFlags ?? {}) as unknown as Record<string, unknown>;
  const limits = planLimits(flags, client.subscription?.plan.maxPages ?? 5);

  const overrides = await prisma.featureFlag.findMany({ where: { clientId } });
  const notDisabled = (k: string) => overrides.find((c) => c.key === k)?.enabled !== false;
  const isEnabled = (k: string) => overrides.find((c) => c.key === k)?.enabled === true;
  limits.forms = limits.forms && notDisabled("contactForm");
  limits.booking = limits.booking && isEnabled("booking");
  limits.payments = limits.payments && isEnabled("invoices");

  const galleryDisabled = overrides.find((c) => c.key === "gallery")?.enabled === false;
  const useGallery = !galleryDisabled && Boolean(form.galleryImageUrls?.length);
  await prisma.featureFlag.upsert({
    where: { clientId_key: { clientId, key: "gallery" } },
    update: { enabled: useGallery },
    create: { clientId, key: "gallery", enabled: useGallery },
  });
  if (form.galleryImageUrls?.length) {
    await prisma.clientMedia.updateMany({
      where: { clientId, url: { in: form.galleryImageUrls } },
      data: { inGallery: true },
    });
  }

  const websiteServices = await listWebsiteServices(clientId);
  const services = websiteServices.length ? websiteServices.map((s) => s.title) : form.services;
  const serviceCatalog = websiteServices.map((s) => ({
    title: s.title,
    description: s.description ?? "",
    durationLabel: serviceDurationLabel(s.durationMinutes),
    priceLabel: s.price != null ? `$${(s.price / 100).toFixed(2)}` : null,
  }));

  const intake: WebsiteIntake = {
    businessName: client.businessName,
    businessType: client.businessType,
    phone: form.contact?.phone || client.ownerPhone,
    email: form.contact?.email || client.ownerEmail,
    address: form.contact?.address || undefined,
    pricing: form.pricing,
    faqs: form.faqs,
    team: form.team,
    about: form.about,
    services,
    serviceCatalog,
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

  return { clientId, form, intake, limits, enabledFeatures, apiIntegrations };
}

/**
 * Phase 1 (Vercel): resolve inputs, run the short config call, build the long HTML prompt, persist
 * everything on the job, then hand off to the edge function. Stub mode (no key) and surgical
 * revisions fall back to the inline worker path (instant / not yet offloaded).
 */
export async function prepareGeneration(jobId: string): Promise<void> {
  const job = await prisma.websiteGenerationJob.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new Error("job_not_found");
  const form = (job.inputIntake ?? {}) as unknown as GenerationForm;

  // No key / forced stub → the inline path is instant; just run it here. Surgical revisions aren't
  // offloaded yet → also run inline (the worker path handles them). Both are safe within 60s.
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY) && !AI_FORCE_STUB;
  const surgical = (form.revisionEdits?.length ?? 0) > 0;
  if (!hasKey || surgical) {
    await runGenerationJob(jobId);
    return;
  }

  await prisma.websiteGenerationJob.update({
    where: { id: jobId },
    data: { status: "GENERATING", startedAt: new Date() },
  });

  try {
    const { clientId, intake, limits, enabledFeatures, apiIntegrations } = await resolveInputs(job);

    // Short config call (cheap model, well under 60s) + the long HTML prompt (run on the edge).
    const result = await generateWebsiteConfig(intake, limits);
    const built: BuiltHtmlPrompt = await prepareHtmlPrompt(intake, limits, clientId);

    const configCreate: Prisma.WebsiteConfigCreateWithoutVersionInput = {
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
    const pagesCreate: Prisma.WebsitePageCreateWithoutVersionInput[] = result.config.pages.map((p, i) => ({
      slug: p.slug,
      title: p.title,
      seoTitle: p.seoTitle,
      metaDescription: p.metaDescription,
      sections: p.sections as Prisma.InputJsonValue,
      order: i,
    }));

    const prepared: Prepared = {
      intake,
      configCreate,
      pagesCreate,
      jobOutput: result.config as unknown as Prisma.InputJsonValue,
      planName: job.website.client.subscription?.plan.name ?? "NECTAR",
      configEngine: result.engine,
      htmlPrompt: htmlPromptDebug(built),
    };

    await prisma.websiteGenerationJob.update({
      where: { id: jobId },
      data: {
        llmPrompt: built as unknown as Prisma.InputJsonValue,
        prepared: prepared as unknown as Prisma.InputJsonValue,
        output: { stage: "Designing and building your pages", percent: 55 } as Prisma.InputJsonValue,
      },
    });

    await dispatchToEdge(jobId, clientId);
  } catch (err) {
    await failJob(jobId, job.website.client.id, err);
  }
}

/** POST the prepared job to the Supabase Edge Function, which runs the long Anthropic call. */
async function dispatchToEdge(jobId: string, clientId: string): Promise<void> {
  const url = process.env.GENERATION_EDGE_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!url || !secret) {
    throw new Error("generation edge function not configured (GENERATION_EDGE_URL / INTERNAL_API_SECRET)");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify({ jobId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`edge dispatch failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  await writeAudit({
    action: "website.generation_dispatched",
    entityType: "WebsiteGenerationJob",
    entityId: jobId,
    clientId,
  });
}

/**
 * Phase 3 (Vercel): the edge function has written `llmResult`. Post-process the HTML (extract,
 * gallery guard, Tailwind precompile), split out the lead/booking blocks, and create the
 * WebsiteVersion — exactly as the worker path does after its inline HTML call.
 */
export async function finalizeGeneration(jobId: string): Promise<void> {
  const job = await prisma.websiteGenerationJob.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new Error("job_not_found");
  const website = job.website;
  const clientId = website.client.id;
  const form = (job.inputIntake ?? {}) as unknown as GenerationForm;

  try {
    const prepared = job.prepared as unknown as Prepared | null;
    const raw = job.llmResult;
    if (!prepared || !raw) throw new Error("finalize called before prepare/edge completed");

    // Extract the document, apply the no-gallery guard, then precompile Tailwind (native; bundled
    // into this route — see next.config). inlineTailwind is a no-op fallback if it can't run.
    let generatedHtml = await inlineTailwind(markNoGallery(finalizeHtmlFromText(raw), prepared.intake));

    const prev = await prisma.websiteVersion.findFirst({
      where: { websiteId: website.id },
      orderBy: { version: "desc" },
      select: { version: true, leadFormHtml: true, bookingHtml: true },
    });

    const { pageHtml, leadFormHtml: extractedForm } = splitLeadForm(generatedHtml);
    generatedHtml = pageHtml;
    const leadFormHtml = extractedForm ?? prev?.leadFormHtml ?? null;

    const { pageHtml: pageHtml2, bookingHtml: extractedBooking } = splitBookingSection(generatedHtml);
    generatedHtml = pageHtml2;
    const bookingHtml = extractedBooking ?? prev?.bookingHtml ?? null;

    const versionNo = (prev?.version ?? 0) + 1;
    const version = await prisma.websiteVersion.create({
      data: {
        websiteId: website.id,
        version: versionNo,
        status: "PREVIEW",
        generatedHtml,
        leadFormHtml,
        bookingHtml,
        config: { create: prepared.configCreate },
        pages: { create: prepared.pagesCreate },
      },
    });

    const savePrompts = process.env.EVAL_SAVE_PROMPTS !== "false";
    const promptLog = savePrompts
      ? ({ kind: "full-generation", config: null, html: prepared.htmlPrompt } as unknown as Prisma.InputJsonValue)
      : undefined;
    await prisma.websiteGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "NEEDS_REVIEW",
        output: prepared.jobOutput,
        finishedAt: new Date(),
        ...(promptLog ? { promptLog } : {}),
      },
    });

    if (isLeadGoal(form.primaryGoal)) {
      await prisma.website.update({ where: { id: website.id }, data: { leadFormGoal: form.primaryGoal } });
    }

    // Preview-before-you-pay: a brand-new site enters PREVIEW; an already-launched site stays
    // "published" (its live version keeps serving; this becomes a pending update).
    const alreadyLaunched = Boolean(website.publishedVersionId) || website.status === "published";
    if (!alreadyLaunched) {
      await prisma.website.update({ where: { id: website.id }, data: { status: "preview" } });
    }
    await prisma.preview.upsert({
      where: { websiteId: website.id },
      update: { status: "IN_REVIEW", generatedAt: new Date(), selectedPlan: prepared.planName, clientId },
      create: {
        websiteId: website.id,
        clientId,
        selectedPlan: prepared.planName,
        status: "IN_REVIEW",
        generatedAt: new Date(),
      },
    });

    await writeAudit({
      action: "website.generated",
      entityType: "WebsiteVersion",
      entityId: version.id,
      clientId,
      metadata: { engine: prepared.configEngine, htmlEngine: "claude", version: versionNo, offload: true } as Prisma.InputJsonValue,
    });
    await emit("website.generated", { websiteId: website.id, versionId: version.id, clientId });
  } catch (err) {
    await failJob(jobId, clientId, err);
  }
}

/** Mark a job FAILED + audit (mirrors runGenerationJob's catch). */
async function failJob(jobId: string, clientId: string, err: unknown): Promise<void> {
  await prisma.websiteGenerationJob.update({
    where: { id: jobId },
    data: { status: "FAILED", error: String(err), finishedAt: new Date() },
  });
  await writeAudit({
    action: "website.generation_failed",
    entityType: "WebsiteGenerationJob",
    entityId: jobId,
    clientId,
    metadata: { error: String(err).slice(0, 500) } as Prisma.InputJsonValue,
  }).catch(() => {});
  console.error("[website] offloaded generation failed:", jobId, err);
}
