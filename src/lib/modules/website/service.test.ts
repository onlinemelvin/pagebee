import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/ai/website-generator", () => ({
  generateWebsiteConfig: vi.fn(),
  generateSiteHtml: vi.fn(),
  editSiteHtml: vi.fn(),
  type: undefined,
}));
vi.mock("@/lib/site/tailwind", () => ({
  recompileTailwind: vi.fn(async (h: string) => h),
}));
vi.mock("@/lib/site/lead-form", () => ({
  splitLeadForm: vi.fn((h: string) => ({ pageHtml: h, leadFormHtml: null })),
}));
vi.mock("@/lib/site/booking", () => ({
  splitBookingSection: vi.fn((h: string) => ({ pageHtml: h, bookingHtml: null })),
  type: undefined,
}));
vi.mock("@/lib/site/lead-goals", () => ({
  isLeadGoal: vi.fn(() => false),
  type: undefined,
}));
vi.mock("@/lib/modules/lead", () => ({
  getLeadFormMeta: vi.fn(async () => null),
}));
vi.mock("@/lib/modules/booking", () => ({
  getBookingMeta: vi.fn(async () => null),
}));
vi.mock("@/lib/modules/subscription", () => ({
  getUpdateQuota: vi.fn(async () => ({ remaining: 3, used: 0, limit: 3 })),
}));
vi.mock("@/lib/modules/service", () => ({
  seedServicesFromNames: vi.fn(async () => {}),
  listWebsiteServices: vi.fn(async () => []),
  serviceDurationLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/modules/review", () => ({
  compileChangeRequest: vi.fn(async () => ({ note: "", commentIds: [], edits: [] })),
  markResolved: vi.fn(async () => {}),
}));
vi.mock("@/lib/plans", () => ({
  planByName: vi.fn((name: string) => ({ name, featureFlags: { contactForm: true, booking: false, chat: false, payments: false, aiAssistant: false }, maxPages: 5, setupFee: 0, monthlyFee: 0 })),
  planRank: vi.fn((name: string) => ({ NECTAR: 0, HONEY: 1, HIVE: 2 }[name as string] ?? 0)),
  topPlan: vi.fn(() => ({
    name: "HIVE",
    featureFlags: { contactForm: true, booking: true, chat: true, payments: true, aiAssistant: true, maxPages: 10 },
    maxPages: 10,
    setupFee: 0,
    monthlyFee: 0,
  })),
}));
vi.mock("@/lib/site/tier-view", () => ({
  listSiteBlocks: vi.fn(() => []),
}));
vi.mock("@/lib/slug", () => ({
  // Pass-through: lowercase and strip non-alphanumeric chars (no actual slugify dep needed)
  slugify: vi.fn((s: string) => s?.toLowerCase().replace(/[^a-z0-9-]/g, "") ?? ""),
}));

import {
  formatBusinessHours,
  planLimits,
  buildComponents,
  effectivePlanForGeneration,
  startGeneration,
  getLatestJobStatus,
  claimNextQueuedJob,
  requeueStaleJobs,
  retryGenerationJob,
  getWebsiteGenStatus,
  listReviewQueue,
  getVersionDetail,
  getVersionRawHtml,
  listWebsiteVersions,
  approveAndPublish,
  releaseToClient,
  autoReleaseStalePreview,
  requestWebsiteUpdate,
  gateRegenQuota,
  checkSubdomain,
  setSubdomain,
  getWebsiteAddress,
  getPublishedSiteBySubdomain,
  getPublishedSiteByDomain,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { topPlan, planByName } from "@/lib/plans";
import { slugify } from "@/lib/slug";

const mockTopPlan = topPlan as ReturnType<typeof vi.fn>;
const mockPlanByName = planByName as ReturnType<typeof vi.fn>;
const mockSlugify = slugify as ReturnType<typeof vi.fn>;

const TOP_PLAN = {
  name: "HIVE",
  featureFlags: { contactForm: true, booking: true, chat: true, payments: true, aiAssistant: true, maxPages: 10 },
  maxPages: 10,
  setupFee: 0,
  monthlyFee: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Restore implementations reset by vi.resetAllMocks() in global setup
  mockTopPlan.mockReturnValue(TOP_PLAN);
  mockPlanByName.mockImplementation((name: string) => ({
    name,
    featureFlags: { contactForm: true, booking: false, chat: false, payments: false, aiAssistant: false },
    maxPages: 5,
    setupFee: 0,
    monthlyFee: 0,
  }));
  mockSlugify.mockImplementation((s: string) => s?.toLowerCase().replace(/[^a-z0-9-]/g, "") ?? "");
  // writeAudit is sometimes chained with .catch() — must return a thenable
  (writeAudit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

// ── Pure helper functions ─────────────────────────────────────────────────────

describe("formatBusinessHours", () => {
  it("returns undefined for empty input", () => {
    expect(formatBusinessHours(undefined)).toBeUndefined();
    expect(formatBusinessHours([])).toBeUndefined();
  });

  it("formats open hours correctly", () => {
    const result = formatBusinessHours([{ day: "Mon", open: "09:00", close: "17:00" }]);
    expect(result).toBe("Mon: 09:00–17:00");
  });

  it("formats closed days correctly", () => {
    const result = formatBusinessHours([{ day: "Sun", closed: true }]);
    expect(result).toBe("Sun: closed");
  });

  it("handles multiple days", () => {
    const result = formatBusinessHours([
      { day: "Mon", open: "09:00", close: "17:00" },
      { day: "Sun", closed: true },
    ]);
    expect(result).toBe("Mon: 09:00–17:00, Sun: closed");
  });
});

describe("planLimits", () => {
  it("derives limits from flags", () => {
    const flags = { maxPages: 5, contactForm: true, booking: false, chat: true, payments: false, aiAssistant: false };
    const limits = planLimits(flags, 3);
    expect(limits).toEqual({ maxPages: 5, forms: true, booking: false, chat: true, payments: false, aiAssistant: false });
  });

  it("falls back to fallbackMaxPages when flag is absent", () => {
    const limits = planLimits({}, 7);
    expect(limits.maxPages).toBe(7);
  });
});

describe("buildComponents", () => {
  const config = {
    copy: {
      heroHeadline: "H", heroSubheadline: "S", ctaText: "CTA",
      services: [], aboutText: "About", faqs: [],
    },
    theme: {},
    pages: [],
    seoTitle: "",
    metaDescription: "",
  } as never;

  it("always includes Hero, Services, About", () => {
    const limits = planLimits({}, 5);
    const components = buildComponents(config, limits);
    const types = components.map((c) => c.component);
    expect(types).toContain("Hero");
    expect(types).toContain("Services");
    expect(types).toContain("About");
  });

  it("includes ContactForm when forms is enabled", () => {
    const limits = planLimits({ contactForm: true }, 5);
    const components = buildComponents(config, limits);
    expect(components.some((c) => c.component === "ContactForm")).toBe(true);
  });

  it("does not include ContactForm when forms is disabled", () => {
    const limits = planLimits({ contactForm: false }, 5);
    const components = buildComponents(config, limits);
    expect(components.some((c) => c.component === "ContactForm")).toBe(false);
  });

  it("includes BookingWidget when booking is enabled", () => {
    const limits = planLimits({ booking: true }, 5);
    const components = buildComponents(config, limits);
    expect(components.some((c) => c.component === "BookingWidget")).toBe(true);
  });
});

describe("effectivePlanForGeneration", () => {
  it("always returns top-tier flags regardless of paid plan", () => {
    const paid = { name: "NECTAR" as const, featureFlags: {}, maxPages: 3 };
    const result = effectivePlanForGeneration(paid, undefined);
    // topPlan mock returns HIVE
    expect(result.showcase).toBe(true);
  });

  it("uses previewPlan as the viewTier when provided", () => {
    const result = effectivePlanForGeneration(null, "HONEY" as never);
    expect(result.planName).toBe("HONEY");
  });

  it("falls back to NECTAR when no paid plan or preview plan", () => {
    const result = effectivePlanForGeneration(null, undefined);
    expect(result.planName).toBe("NECTAR");
  });
});

// ── startGeneration ───────────────────────────────────────────────────────────

describe("startGeneration", () => {
  it("throws client_not_found when the client does not exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(startGeneration("c1", {} as never)).rejects.toThrow("client_not_found");
  });

  it("creates a website when the client has none, then queues a job", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ id: "c1", slug: "acme", websites: [] });
    prismaMock.website.create.mockResolvedValue({ id: "w1" });
    prismaMock.websiteGenerationJob.create.mockResolvedValue({ id: "j1", websiteId: "w1" });

    const result = await startGeneration("c1", { businessName: "Acme" } as never);

    expect(prismaMock.website.create).toHaveBeenCalled();
    expect(prismaMock.websiteGenerationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "QUEUED", websiteId: "w1" }) }),
    );
    expect(result.jobId).toBe("j1");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "website.generation_requested", clientId: "c1" }),
    );
  });

  it("reuses an existing website when the client has one", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "c1", slug: "acme", websites: [{ id: "w1" }],
    });
    prismaMock.websiteGenerationJob.create.mockResolvedValue({ id: "j1", websiteId: "w1" });

    await startGeneration("c1", {} as never);

    expect(prismaMock.website.create).not.toHaveBeenCalled();
  });
});

// ── getLatestJobStatus ────────────────────────────────────────────────────────

describe("getLatestJobStatus", () => {
  it("returns the latest job for the client's website", async () => {
    const job = { id: "j1", status: "QUEUED", error: null, createdAt: new Date() };
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue(job);
    const result = await getLatestJobStatus("c1");
    expect(result).toBe(job);
    expect(prismaMock.websiteGenerationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { website: { clientId: "c1" } } }),
    );
  });
});

// ── claimNextQueuedJob ────────────────────────────────────────────────────────

describe("claimNextQueuedJob", () => {
  it("returns null when no QUEUED jobs exist", async () => {
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue(null);
    expect(await claimNextQueuedJob()).toBeNull();
  });

  it("claims the oldest QUEUED job atomically", async () => {
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ id: "j1" });
    prismaMock.websiteGenerationJob.updateMany.mockResolvedValue({ count: 1 });

    const jobId = await claimNextQueuedJob();

    expect(jobId).toBe("j1");
    expect(prismaMock.websiteGenerationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j1", status: "QUEUED" }, data: expect.objectContaining({ status: "GENERATING" }) }),
    );
  });

  it("returns null when another worker already claimed the job (count === 0)", async () => {
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ id: "j1" });
    prismaMock.websiteGenerationJob.updateMany.mockResolvedValue({ count: 0 });

    expect(await claimNextQueuedJob()).toBeNull();
  });
});

// ── requeueStaleJobs ──────────────────────────────────────────────────────────

describe("requeueStaleJobs", () => {
  it("requeues jobs older than the cutoff and returns the count", async () => {
    prismaMock.websiteGenerationJob.updateMany.mockResolvedValue({ count: 3 });
    const result = await requeueStaleJobs(5 * 60 * 1000);
    expect(result).toBe(3);
    expect(prismaMock.websiteGenerationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "GENERATING" }), data: { status: "QUEUED" } }),
    );
  });
});

// ── retryGenerationJob ────────────────────────────────────────────────────────

describe("retryGenerationJob", () => {
  it("throws job_not_found for an unknown job", async () => {
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(null);
    await expect(retryGenerationJob("bad-id", "admin1")).rejects.toThrow("job_not_found");
  });

  it("requeues the job and audits it", async () => {
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue({
      id: "j1",
      website: { clientId: "c1" },
    });
    prismaMock.websiteGenerationJob.update.mockResolvedValue({ id: "j1" });
    prismaMock.websiteGenerationJob.updateMany.mockResolvedValue({ count: 0 }); // claimAndRun → already running

    const result = await retryGenerationJob("j1", "admin1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.websiteGenerationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j1" }, data: expect.objectContaining({ status: "QUEUED" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "website.generation_retried", clientId: "c1", actorId: "admin1" }));
  });
});

// ── getWebsiteGenStatus ───────────────────────────────────────────────────────

describe("getWebsiteGenStatus", () => {
  it("returns null when the version does not exist", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue(null);
    expect(await getWebsiteGenStatus("bad-vid")).toBeNull();
  });

  it("reports generating: true for QUEUED or GENERATING jobs", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue({ websiteId: "w1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v2" });
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ status: "GENERATING" });

    const result = await getWebsiteGenStatus("v1");

    expect(result?.generating).toBe(true);
    expect(result?.failed).toBe(false);
    expect(result?.latestVersionId).toBe("v2");
  });

  it("reports failed: true for a FAILED job", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue({ websiteId: "w1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ status: "FAILED" });

    const result = await getWebsiteGenStatus("v1");

    expect(result?.generating).toBe(false);
    expect(result?.failed).toBe(true);
  });
});

// ── listReviewQueue ───────────────────────────────────────────────────────────

describe("listReviewQueue", () => {
  it("queries PREVIEW versions ordered by createdAt desc", async () => {
    prismaMock.websiteVersion.findMany.mockResolvedValue([]);
    await listReviewQueue();
    expect(prismaMock.websiteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PREVIEW" }, orderBy: { createdAt: "desc" } }),
    );
  });
});

// ── getVersionDetail / getVersionRawHtml / listWebsiteVersions ────────────────

describe("getVersionDetail", () => {
  it("returns null for unknown version", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue(null);
    expect(await getVersionDetail("vid")).toBeNull();
  });
});

describe("getVersionRawHtml", () => {
  it("returns null when version not found", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue(null);
    expect(await getVersionRawHtml("vid")).toBeNull();
  });

  it("returns the raw html when found", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue({ generatedHtml: "<html/>" });
    expect(await getVersionRawHtml("vid")).toBe("<html/>");
  });
});

describe("listWebsiteVersions", () => {
  it("queries by websiteId ordered newest first", async () => {
    prismaMock.websiteVersion.findMany.mockResolvedValue([]);
    await listWebsiteVersions("w1");
    expect(prismaMock.websiteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { websiteId: "w1" }, orderBy: { version: "desc" } }),
    );
  });
});

// ── approveAndPublish ─────────────────────────────────────────────────────────

describe("approveAndPublish", () => {
  it("throws version_not_found for unknown version", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue(null);
    await expect(approveAndPublish("bad-id")).rejects.toThrow("version_not_found");
  });

  it("runs a transaction to mark adminReviewed, set status PUBLISHED, and flip website", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue({
      id: "v1",
      websiteId: "w1",
      website: { clientId: "c1" },
    });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    prismaMock.websiteConfig.update.mockResolvedValue({});
    prismaMock.websiteVersion.update.mockResolvedValue({});
    prismaMock.website.update.mockResolvedValue({});

    await approveAndPublish("v1", "admin1");

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.websiteConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminReviewed: true, reviewedById: "admin1" }) }),
    );
    expect(prismaMock.websiteVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PUBLISHED" } }),
    );
    expect(prismaMock.website.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publishedVersionId: "v1", status: "published" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "website.published", clientId: "c1", actorId: "admin1" }));
  });
});

// ── releaseToClient ───────────────────────────────────────────────────────────

describe("releaseToClient", () => {
  it("throws version_not_found for unknown version", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue(null);
    await expect(releaseToClient("bad-id")).rejects.toThrow("version_not_found");
  });

  it("marks config adminReviewed, upserts preview to PREVIEW_READY, audits, and emits", async () => {
    prismaMock.websiteVersion.findUnique.mockResolvedValue({
      id: "v1",
      website: {
        id: "w1",
        clientId: "c1",
        client: { subscription: { plan: { name: "HONEY" } } },
      },
    });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    prismaMock.websiteConfig.update.mockResolvedValue({});
    prismaMock.preview.upsert.mockResolvedValue({});

    await releaseToClient("v1", "rev1");

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.websiteConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminReviewed: true, reviewedById: "rev1" }) }),
    );
    expect(prismaMock.preview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: "PREVIEW_READY" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "website.preview_released", clientId: "c1", actorId: "rev1" }));
    expect(emit).toHaveBeenCalledWith("website.preview_released", expect.objectContaining({ versionId: "v1" }));
  });
});

// ── autoReleaseStalePreview ───────────────────────────────────────────────────

describe("autoReleaseStalePreview", () => {
  it("returns false when there is no overdue preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    expect(await autoReleaseStalePreview("c1")).toBe(false);
  });

  it("returns false when there is no version for the stale preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue(null);
    expect(await autoReleaseStalePreview("c1")).toBe(false);
  });

  it("releases the latest version and audits when the preview is overdue", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    // releaseToClient internals:
    prismaMock.websiteVersion.findUnique.mockResolvedValue({
      id: "v1",
      website: { id: "w1", clientId: "c1", client: { subscription: { plan: { name: "NECTAR" } } } },
    });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    prismaMock.websiteConfig.update.mockResolvedValue({});
    prismaMock.preview.upsert.mockResolvedValue({});

    const released = await autoReleaseStalePreview("c1");

    expect(released).toBe(true);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "website.preview_auto_released", clientId: "c1" }),
    );
  });
});

// ── checkSubdomain / setSubdomain ─────────────────────────────────────────────

describe("checkSubdomain", () => {
  it("rejects too-short subdomains", async () => {
    const result = await checkSubdomain("c1", "ab");
    expect(result).toMatchObject({ available: false, reason: "too_short" });
  });

  it("rejects reserved subdomains", async () => {
    const result = await checkSubdomain("c1", "www");
    expect(result).toMatchObject({ available: false, reason: "reserved" });
  });

  it("rejects taken subdomains (owned by another tenant)", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w2" });
    const result = await checkSubdomain("c1", "acme");
    expect(result).toMatchObject({ available: false, reason: "taken" });
  });

  it("returns available for a valid unused subdomain", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    const result = await checkSubdomain("c1", "acmeplumbing");
    expect(result).toMatchObject({ available: true, subdomain: "acmeplumbing" });
  });
});

describe("setSubdomain", () => {
  it("throws when the subdomain is not available (too short)", async () => {
    await expect(setSubdomain("c1", "ab")).rejects.toThrow("too_short");
  });

  it("throws no_website when the client has no website", async () => {
    prismaMock.website.findFirst
      .mockResolvedValueOnce(null) // checkSubdomain: no taken conflict
      .mockResolvedValueOnce(null); // getWebsite
    await expect(setSubdomain("c1", "acmeplumbing")).rejects.toThrow("no_website");
  });

  it("updates the subdomain and audits on success", async () => {
    prismaMock.website.findFirst
      .mockResolvedValueOnce(null) // checkSubdomain
      .mockResolvedValueOnce({ id: "w1" }); // find website
    prismaMock.website.update.mockResolvedValue({});

    const result = await setSubdomain("c1", "acmeplumbing");

    expect(result.subdomain).toBe("acmeplumbing");
    expect(prismaMock.website.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { subdomain: "acmeplumbing" } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "website.subdomain_changed", clientId: "c1" }));
  });
});

// ── getWebsiteAddress ─────────────────────────────────────────────────────────

describe("getWebsiteAddress", () => {
  it("returns null subdomain when the client has no website", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    const addr = await getWebsiteAddress("c1");
    expect(addr.subdomain).toBeNull();
    expect(addr.rootDomain).toBeTruthy();
  });

  it("returns the subdomain when a website exists", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ subdomain: "acme" });
    const addr = await getWebsiteAddress("c1");
    expect(addr.subdomain).toBe("acme");
  });
});

// ── getPublishedSiteBySubdomain / getPublishedSiteByDomain ────────────────────

describe("getPublishedSiteBySubdomain", () => {
  it("queries published sites by subdomain", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    await getPublishedSiteBySubdomain("acme");
    expect(prismaMock.website.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subdomain: "acme", status: "published" }) }),
    );
  });
});

describe("getPublishedSiteByDomain", () => {
  it("returns null when no active domain link exists", async () => {
    prismaMock.websiteDomain.findFirst.mockResolvedValue(null);
    expect(await getPublishedSiteByDomain("acme.com")).toBeNull();
  });

  it("loads the website when an active domain link exists", async () => {
    prismaMock.websiteDomain.findFirst.mockResolvedValue({ websiteId: "w1" });
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1", status: "published" });
    await getPublishedSiteByDomain("acme.com");
    expect(prismaMock.website.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "w1", status: "published" }) }),
    );
  });
});

// ── requestWebsiteUpdate ──────────────────────────────────────────────────────

describe("requestWebsiteUpdate", () => {
  it("returns no_live_site when there is no published site with a published version", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    const result = await requestWebsiteUpdate("c1", "update text");
    expect(result).toMatchObject({ ok: false, reason: "no_live_site" });
  });

  it("returns out_of_updates when the quota is exhausted", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1", publishedVersionId: "v1" });
    const { getUpdateQuota } = await import("@/lib/modules/subscription");
    (getUpdateQuota as ReturnType<typeof vi.fn>).mockResolvedValue({ remaining: 0, used: 3, limit: 3 });

    const result = await requestWebsiteUpdate("c1", "update text");
    expect(result).toMatchObject({ ok: false, reason: "out_of_updates" });
  });

  it("returns no_content when no note and no pins", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1", publishedVersionId: "v1" });
    const { getUpdateQuota } = await import("@/lib/modules/subscription");
    (getUpdateQuota as ReturnType<typeof vi.fn>).mockResolvedValue({ remaining: 3, used: 0, limit: 3 });
    const { compileChangeRequest } = await import("@/lib/modules/review");
    (compileChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ note: "", commentIds: [], edits: [] });

    const result = await requestWebsiteUpdate("c1"); // no note, no pins
    expect(result).toMatchObject({ ok: false, reason: "no_content" });
  });
});

// ── gateRegenQuota ────────────────────────────────────────────────────────────

describe("gateRegenQuota", () => {
  it("returns ok: true for a pre-launch site (not yet published)", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null); // no published site
    const result = await gateRegenQuota("c1");
    expect(result).toEqual({ ok: true });
  });

  it("returns out_of_updates when published site exists and quota is zero", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    const { getUpdateQuota } = await import("@/lib/modules/subscription");
    (getUpdateQuota as ReturnType<typeof vi.fn>).mockResolvedValue({ remaining: 0, used: 3, limit: 3 });

    const result = await gateRegenQuota("c1");
    expect(result).toMatchObject({ ok: false, reason: "out_of_updates" });
  });

  it("consumes quota and returns ok: true when quota remains", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    const { getUpdateQuota } = await import("@/lib/modules/subscription");
    (getUpdateQuota as ReturnType<typeof vi.fn>).mockResolvedValue({ remaining: 2, used: 1, limit: 3 });
    prismaMock.websiteUpdate.create.mockResolvedValue({ id: "u1" });

    const result = await gateRegenQuota("c1");
    expect(result).toEqual({ ok: true });
    expect(prismaMock.websiteUpdate.create).toHaveBeenCalled();
  });
});
