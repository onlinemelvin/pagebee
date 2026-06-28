import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/ai/website-generator", () => ({
  generateWebsiteConfig: vi.fn(),
  prepareHtmlPrompt: vi.fn(),
  finalizeHtmlFromText: vi.fn((t: string) => t),
  markNoGallery: vi.fn((html: string) => html),
  htmlPromptDebug: vi.fn(() => ({ system: "", user: "" })),
  type: undefined,
}));
vi.mock("@/lib/ai/models", () => ({
  AI_FORCE_STUB: false,
  QUALITY_MODEL: "stub",
  CHEAP_MODEL: "stub",
}));
vi.mock("@/lib/site/tailwind", () => ({
  inlineTailwind: vi.fn(async (h: string) => h),
}));
vi.mock("@/lib/site/lead-form", () => ({
  splitLeadForm: vi.fn((h: string) => ({ pageHtml: h, leadFormHtml: null })),
}));
vi.mock("@/lib/site/booking", () => ({
  splitBookingSection: vi.fn((h: string) => ({ pageHtml: h, bookingHtml: null })),
}));
vi.mock("@/lib/site/lead-goals", () => ({
  isLeadGoal: vi.fn(() => false),
}));
vi.mock("@/lib/modules/service", () => ({
  listWebsiteServices: vi.fn(async () => []),
  serviceDurationLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/plans", () => ({
  planByName: vi.fn((name: string) => ({ name, featureFlags: {}, maxPages: 5, setupFee: 0, monthlyFee: 0 })),
  planRank: vi.fn((name: string) => ({ NECTAR: 0, HONEY: 1, HIVE: 2 }[name] ?? 0)),
  topPlan: vi.fn(() => ({
    name: "HIVE",
    featureFlags: { contactForm: true, booking: true, chat: true, payments: true, aiAssistant: true, maxPages: 10 },
    maxPages: 10,
  })),
}));
// Mock the service module (same package — avoids circular deps in tests)
vi.mock("./service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service")>();
  return {
    ...actual,
    runGenerationJob: vi.fn(async () => {}),
    planLimits: actual.planLimits,
    buildComponents: actual.buildComponents,
    formatBusinessHours: actual.formatBusinessHours,
    effectivePlanForGeneration: actual.effectivePlanForGeneration,
  };
});

import { prepareGeneration, finalizeGeneration } from "./generation-offload";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { finalizeHtmlFromText, markNoGallery, htmlPromptDebug } from "@/lib/ai/website-generator";
import { runGenerationJob } from "./service";
import { topPlan } from "@/lib/plans";
import { inlineTailwind } from "@/lib/site/tailwind";
import { splitLeadForm } from "@/lib/site/lead-form";
import { splitBookingSection } from "@/lib/site/booking";
import { isLeadGoal } from "@/lib/site/lead-goals";

const mockRunGenerationJob = runGenerationJob as ReturnType<typeof vi.fn>;
const mockTopPlan = topPlan as ReturnType<typeof vi.fn>;
const mockWriteAudit = writeAudit as ReturnType<typeof vi.fn>;

const TOP_PLAN = {
  name: "HIVE",
  featureFlags: { contactForm: true, booking: true, chat: true, payments: true, aiAssistant: true, maxPages: 10 },
  maxPages: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  // The global setup runs vi.resetAllMocks(), which wipes vi.mock() factory
  // implementations too — so re-apply every mocked function we rely on for a
  // return value here.
  mockTopPlan.mockReturnValue(TOP_PLAN);
  mockRunGenerationJob.mockResolvedValue(undefined);
  // writeAudit is called with .catch() in failJob — must return a thenable
  mockWriteAudit.mockResolvedValue(undefined);
  vi.mocked(finalizeHtmlFromText).mockImplementation((t: string) => t);
  vi.mocked(markNoGallery).mockImplementation((html: string) => html);
  vi.mocked(htmlPromptDebug).mockReturnValue({ system: "", user: "" } as never);
  vi.mocked(inlineTailwind).mockImplementation(async (h: string) => h);
  vi.mocked(splitLeadForm).mockImplementation((h: string) => ({ pageHtml: h, leadFormHtml: null }) as never);
  vi.mocked(splitBookingSection).mockImplementation((h: string) => ({ pageHtml: h, bookingHtml: null }) as never);
  vi.mocked(isLeadGoal).mockReturnValue(false);
  // websiteGenerationJob.update is called in failJob
  prismaMock.websiteGenerationJob.update.mockResolvedValue({} as never);
  // Make the no-key fallback deterministic regardless of the host env.
  delete process.env.ANTHROPIC_API_KEY;
});

// ── shared fixtures ───────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "j1",
    status: "QUEUED",
    inputIntake: {},
    llmPrompt: null,
    llmResult: null,
    prepared: null,
    website: {
      id: "w1",
      status: "draft",
      publishedVersionId: null,
      client: {
        id: "c1",
        businessName: "Acme",
        businessType: "plumbing",
        ownerPhone: "555-0100",
        ownerEmail: "owner@acme.com",
        subscription: {
          plan: {
            name: "NECTAR",
            featureFlags: { contactForm: false, maxPages: 3 },
            maxPages: 3,
          },
        },
      },
    },
    ...overrides,
  };
}

// ── prepareGeneration ─────────────────────────────────────────────────────────

describe("prepareGeneration", () => {
  it("throws job_not_found when the job does not exist", async () => {
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(null);
    await expect(prepareGeneration("bad-id")).rejects.toThrow("job_not_found");
  });

  it("falls back to runGenerationJob when AI key is absent (AI_FORCE_STUB path in test)", async () => {
    // In tests ANTHROPIC_API_KEY is not set, so hasKey is false → runs inline
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(makeJob());
    mockRunGenerationJob.mockResolvedValue(undefined);

    await prepareGeneration("j1");

    expect(mockRunGenerationJob).toHaveBeenCalledWith("j1");
  });

  it("falls back to runGenerationJob for surgical revisions (even with a key)", async () => {
    // Simulate having a key by providing one, but the job has revisionEdits → surgical → inline
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(
      makeJob({ inputIntake: { revisionEdits: [{ pagePath: "/", selector: null, anchorText: null, instruction: "fix hero" }] } }),
    );
    mockRunGenerationJob.mockResolvedValue(undefined);

    await prepareGeneration("j1");

    expect(mockRunGenerationJob).toHaveBeenCalledWith("j1");
    delete process.env.ANTHROPIC_API_KEY;
  });
});

// ── finalizeGeneration ────────────────────────────────────────────────────────

describe("finalizeGeneration", () => {
  it("throws job_not_found when the job does not exist", async () => {
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(null);
    await expect(finalizeGeneration("bad-id")).rejects.toThrow("job_not_found");
  });

  it("marks job FAILED when prepared/llmResult are missing", async () => {
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(makeJob({ llmResult: null, prepared: null }));
    prismaMock.websiteGenerationJob.update.mockResolvedValue({});

    await finalizeGeneration("j1");

    expect(prismaMock.websiteGenerationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("creates a WebsiteVersion and marks the job NEEDS_REVIEW on success", async () => {
    const prepared = {
      intake: { galleryImageUrls: [] },
      configCreate: { theme: {}, copy: {}, enabledFeatures: {}, apiIntegrations: {}, components: [], seoDefaults: {}, adminReviewed: false },
      pagesCreate: [],
      jobOutput: {},
      planName: "NECTAR",
      configEngine: "stub",
      htmlPrompt: { system: "", user: "" },
    };
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(
      makeJob({ llmResult: "<html>site</html>", prepared }),
    );
    prismaMock.websiteVersion.findFirst.mockResolvedValue(null); // no previous version
    prismaMock.websiteVersion.create.mockResolvedValue({ id: "v1" });
    prismaMock.websiteGenerationJob.update.mockResolvedValue({});
    prismaMock.website.update.mockResolvedValue({});
    prismaMock.preview.upsert.mockResolvedValue({});

    await finalizeGeneration("j1");

    expect(prismaMock.websiteVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1, status: "PREVIEW" }) }),
    );
    expect(prismaMock.websiteGenerationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NEEDS_REVIEW" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "website.generated", clientId: "c1" }));
    expect(emit).toHaveBeenCalledWith("website.generated", expect.objectContaining({ websiteId: "w1", clientId: "c1" }));
  });

  it("does not demote website status when the site is already published", async () => {
    const prepared = {
      intake: { galleryImageUrls: [] },
      configCreate: { theme: {}, copy: {}, enabledFeatures: {}, apiIntegrations: {}, components: [], seoDefaults: {}, adminReviewed: false },
      pagesCreate: [],
      jobOutput: {},
      planName: "NECTAR",
      configEngine: "stub",
      htmlPrompt: { system: "", user: "" },
    };
    prismaMock.websiteGenerationJob.findUnique.mockResolvedValue(
      makeJob({
        llmResult: "<html/>",
        prepared,
        website: {
          id: "w1",
          status: "published",
          publishedVersionId: "v-old",
          client: {
            id: "c1",
            businessName: "Acme",
            businessType: null,
            ownerPhone: null,
            ownerEmail: null,
            subscription: { plan: { name: "NECTAR", featureFlags: {}, maxPages: 3 } },
          },
        },
      }),
    );
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ version: 2, leadFormHtml: null, bookingHtml: null });
    prismaMock.websiteVersion.create.mockResolvedValue({ id: "v2" });
    prismaMock.websiteGenerationJob.update.mockResolvedValue({});
    prismaMock.website.update.mockResolvedValue({});
    prismaMock.preview.upsert.mockResolvedValue({});

    await finalizeGeneration("j1");

    // website.update should NOT be called with status: "preview" for an already-published site
    const websiteUpdateCalls = (prismaMock.website.update as ReturnType<typeof vi.fn>).mock.calls;
    const demotionCall = websiteUpdateCalls.find(
      (args) => args[0]?.data?.status === "preview",
    );
    expect(demotionCall).toBeUndefined();
  });
});
