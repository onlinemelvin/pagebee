import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/website", () => ({
  startGeneration: vi.fn(async () => ({ jobId: "j1", websiteId: "w1" })),
  claimAndRun: vi.fn(() => Promise.resolve()),
  approveAndPublish: vi.fn(() => Promise.resolve()),
  type: undefined,
}));
vi.mock("@/lib/modules/review", () => ({
  compileChangeRequest: vi.fn(async () => ({ note: "", commentIds: [], edits: [] })),
  markResolved: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/policy", () => ({
  setupFeeRequired: vi.fn(() => true), // real accounts require payment by default
}));
vi.mock("@/lib/modules/subscription", () => ({
  getUpdateQuota: vi.fn(async () => ({ remaining: 3, used: 0, limit: 3 })),
}));
vi.mock("@/lib/plans", () => ({
  planRank: vi.fn((name: string) => ({ NECTAR: 0, HONEY: 1, HIVE: 2 }[name] ?? 0)),
}));

import {
  getClientPreview,
  getReviewableVersionId,
  getClientReviewContext,
  requestRevision,
  approve,
  launchPreview,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { startGeneration, approveAndPublish } from "@/lib/modules/website";
import { compileChangeRequest } from "@/lib/modules/review";
import { setupFeeRequired } from "@/lib/auth/policy";
import { getUpdateQuota } from "@/lib/modules/subscription";
import { planRank } from "@/lib/plans";

const mockSetupFeeRequired = setupFeeRequired as ReturnType<typeof vi.fn>;
const mockStartGeneration = startGeneration as ReturnType<typeof vi.fn>;
const mockApproveAndPublish = approveAndPublish as ReturnType<typeof vi.fn>;
const mockCompileChangeRequest = compileChangeRequest as ReturnType<typeof vi.fn>;
const mockGetUpdateQuota = getUpdateQuota as ReturnType<typeof vi.fn>;
const mockPlanRank = planRank as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Restore implementations cleared by vi.resetAllMocks() in global setup
  mockSetupFeeRequired.mockReturnValue(true);
  mockStartGeneration.mockResolvedValue({ jobId: "j1", websiteId: "w1" });
  mockApproveAndPublish.mockResolvedValue(undefined);
  // claimAndRun is used fire-and-forget with .catch(); must return a Promise
  const { claimAndRun } = await import("@/lib/modules/website");
  (claimAndRun as ReturnType<typeof vi.fn>).mockReturnValue(Promise.resolve());
  mockCompileChangeRequest.mockResolvedValue({ note: "", commentIds: [], edits: [] });
  mockGetUpdateQuota.mockResolvedValue({ remaining: 3, used: 0, limit: 3 });
  mockPlanRank.mockImplementation((name: string) => ({ NECTAR: 0, HONEY: 1, HIVE: 2 }[name as string] ?? 0));
});

// ── getClientPreview ──────────────────────────────────────────────────────────

describe("getClientPreview", () => {
  it("queries the latest preview for the client", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1" });
    const result = await getClientPreview("c1");
    expect(result).toEqual({ id: "p1" });
    expect(prismaMock.preview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });
});

// ── getReviewableVersionId ────────────────────────────────────────────────────

describe("getReviewableVersionId", () => {
  it("returns null when there is no preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    expect(await getReviewableVersionId("c1")).toBeNull();
  });

  it("returns the latest version id for the preview's website", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    expect(await getReviewableVersionId("c1")).toBe("v1");
  });
});

// ── getClientReviewContext ────────────────────────────────────────────────────

describe("getClientReviewContext", () => {
  it("returns canComment: false when there is no preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    const result = await getClientReviewContext("c1");
    expect(result).toMatchObject({ canComment: false, versionId: null, revisionsLeft: 0 });
  });

  it("uses update quota for a LIVE preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1", status: "LIVE" });
    prismaMock.website.findFirst.mockResolvedValue({ publishedVersionId: "v1" });
    mockGetUpdateQuota.mockResolvedValue({ remaining: 2, used: 1, limit: 3 });

    const result = await getClientReviewContext("c1");
    expect(result.canComment).toBe(true);
    expect(result.revisionsLeft).toBe(2);
    expect(result.versionId).toBe("v1");
  });

  it("returns canComment: false for LIVE with no published version", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1", status: "LIVE" });
    prismaMock.website.findFirst.mockResolvedValue(null);

    const result = await getClientReviewContext("c1");
    expect(result.canComment).toBe(false);
  });

  it("reports correct revisionsLeft for a pre-launch preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1",
      websiteId: "w1",
      status: "PREVIEW_READY",
      maxFreeRevisions: 2,
      revisionCount: 1,
    });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });

    const result = await getClientReviewContext("c1");
    expect(result.revisionsLeft).toBe(1);
    expect(result.canComment).toBe(true);
    expect(result.versionId).toBe("v1");
  });

  it("returns canComment: false when revisions are exhausted", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1",
      websiteId: "w1",
      status: "PREVIEW_READY",
      maxFreeRevisions: 1,
      revisionCount: 1,
    });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });

    const result = await getClientReviewContext("c1");
    expect(result.canComment).toBe(false);
    expect(result.revisionsLeft).toBe(0);
  });
});

// ── requestRevision ───────────────────────────────────────────────────────────

describe("requestRevision", () => {
  it("throws no_preview (404) when there is no preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    await expect(requestRevision("c1", "fix hero")).rejects.toMatchObject({ code: "no_preview", status: 404 });
  });

  it("throws already_live (400) when the preview is LIVE", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", websiteId: "w1", status: "LIVE", revisionCount: 0, maxFreeRevisions: 1 });
    await expect(requestRevision("c1", "fix")).rejects.toMatchObject({ code: "already_live" });
  });

  it("throws no_revisions_left (403) when revisions are exhausted", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1", websiteId: "w1", status: "PREVIEW_READY", revisionCount: 2, maxFreeRevisions: 2,
    });
    await expect(requestRevision("c1", "fix")).rejects.toMatchObject({ code: "no_revisions_left", status: 403 });
  });

  it("throws no_content (400) when there is no note and no pins", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1", websiteId: "w1", status: "PREVIEW_READY", revisionCount: 0, maxFreeRevisions: 2,
    });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    mockCompileChangeRequest.mockResolvedValue({ note: "", commentIds: [], edits: [] });
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue(null);

    await expect(requestRevision("c1")).rejects.toMatchObject({ code: "no_content" });
  });

  it("queues a revision job, increments revisionCount, audits on success", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1", websiteId: "w1", status: "PREVIEW_READY", revisionCount: 0, maxFreeRevisions: 2,
    });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    mockCompileChangeRequest.mockResolvedValue({ note: "", commentIds: [], edits: [] });
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ inputIntake: {} });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.previewRevision.create.mockResolvedValue({});

    const result = await requestRevision("c1", "please fix the hero text");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PREVIEW_GENERATING", revisionCount: { increment: 1 } }) }),
    );
    expect(mockStartGeneration).toHaveBeenCalledWith("c1", expect.objectContaining({ revisionNote: "please fix the hero text" }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.revision_requested", clientId: "c1" }));
  });
});

// ── approve ───────────────────────────────────────────────────────────────────

describe("approve", () => {
  it("throws no_preview (404) when there is no preview", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    await expect(approve("c1")).rejects.toMatchObject({ code: "no_preview" });
  });

  it("returns launched: true immediately when preview is already LIVE", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", status: "LIVE" });
    const result = await approve("c1");
    expect(result).toEqual({ launched: true });
  });

  it("throws not_ready (400) when preview is not PREVIEW_READY", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "p1", status: "IN_REVIEW" });
    await expect(approve("c1")).rejects.toMatchObject({ code: "not_ready" });
  });

  it("republishes immediately for an already-launched site (setup fee already paid)", async () => {
    const previewRow = {
      id: "p1", websiteId: "w1", clientId: "c1", status: "PREVIEW_READY", selectedPlan: "HONEY",
      prospectId: null,
    };
    prismaMock.preview.findFirst.mockResolvedValue(previewRow);
    prismaMock.website.findUnique.mockResolvedValue({ status: "published", publishedVersionId: "v-old" });
    // subscription: first call in approve (alreadyLaunched check), second call in launchPreview
    prismaMock.subscription.findUnique
      .mockResolvedValueOnce({ setupFeePaid: true, plan: { name: "HONEY" } }) // approve
      .mockResolvedValueOnce({ id: "sub1", agreedSetupFee: 0, agreedMonthlyFee: 0 }); // launchPreview

    // launchPreview internals
    prismaMock.preview.findUnique.mockResolvedValue(previewRow);
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v2" });
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.conversion.upsert.mockResolvedValue({});
    prismaMock.preview.update.mockResolvedValue({});

    const result = await approve("c1");

    expect(result).toMatchObject({ launched: true, updated: true });
    expect(mockApproveAndPublish).toHaveBeenCalled();
  });

  it("gates free republish when preview selectedPlan is higher than the paid plan", async () => {
    const previewRow = { id: "p1", websiteId: "w1", status: "PREVIEW_READY", selectedPlan: "HIVE" };
    prismaMock.preview.findFirst.mockResolvedValue(previewRow);
    prismaMock.website.findUnique.mockResolvedValue({ status: "published", publishedVersionId: "v-old" });
    // sub plan is HONEY (lower than HIVE selected plan) — planRank(HIVE) > planRank(HONEY)
    prismaMock.subscription.findUnique.mockResolvedValue({ setupFeePaid: true, plan: { name: "HONEY" } });

    const result = await approve("c1");

    expect(result).toMatchObject({ launched: false, awaitingUpgrade: true, toPlan: "HIVE" });
  });

  it("requires payment for a first-launch real account", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({
      id: "p1", websiteId: "w1", status: "PREVIEW_READY", selectedPlan: "NECTAR",
    });
    prismaMock.website.findUnique.mockResolvedValue({ status: "preview", publishedVersionId: null });
    prismaMock.subscription.findUnique.mockResolvedValue({ setupFeePaid: false, plan: { name: "NECTAR" } });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.client.findUnique.mockResolvedValue({ isTest: false });
    mockSetupFeeRequired.mockReturnValue(true);

    const result = await approve("c1");

    expect(result).toMatchObject({ launched: false, awaitingPayment: true });
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SETUP_FEE_PENDING" } }),
    );
  });

  it("launches immediately for a test account (no setup fee)", async () => {
    const previewRow = {
      id: "p1", websiteId: "w1", clientId: "c1", status: "PREVIEW_READY", selectedPlan: "NECTAR",
      prospectId: null,
    };
    prismaMock.preview.findFirst.mockResolvedValue(previewRow);
    prismaMock.website.findUnique.mockResolvedValue({ status: "preview", publishedVersionId: null });
    prismaMock.subscription.findUnique
      .mockResolvedValueOnce({ setupFeePaid: false, plan: { name: "NECTAR" } }) // approve
      .mockResolvedValueOnce({ id: "sub1", agreedSetupFee: 0, agreedMonthlyFee: 0 }); // launchPreview
    prismaMock.client.findUnique.mockResolvedValue({ isTest: true });
    mockSetupFeeRequired.mockReturnValue(false); // test accounts skip the fee

    // launchPreview internals
    prismaMock.preview.findUnique.mockResolvedValue(previewRow);
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.conversion.upsert.mockResolvedValue({});

    const result = await approve("c1");

    expect(result).toMatchObject({ launched: true });
    expect(mockApproveAndPublish).toHaveBeenCalled();
  });
});

// ── launchPreview ─────────────────────────────────────────────────────────────

describe("launchPreview", () => {
  it("throws cannot_launch (400) when the preview row is missing key fields", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(null);
    await expect(launchPreview("p1")).rejects.toMatchObject({ code: "cannot_launch" });
  });

  it("throws no_version (400) when there is no website version", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ id: "p1", websiteId: "w1", clientId: "c1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue(null);
    await expect(launchPreview("p1")).rejects.toMatchObject({ code: "no_version" });
  });

  it("publishes the latest version, activates subscription, upserts conversion, sets LIVE", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({
      id: "p1",
      websiteId: "w1",
      clientId: "c1",
      prospectId: "pro1",
      selectedPlan: "HONEY",
    });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      agreedSetupFee: 19900,
      agreedMonthlyFee: 4900,
    });
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.conversion.upsert.mockResolvedValue({});
    prismaMock.preview.update.mockResolvedValue({});

    await launchPreview("p1");

    expect(mockApproveAndPublish).toHaveBeenCalledWith("v1", null);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(prismaMock.conversion.upsert).toHaveBeenCalled();
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "LIVE" } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.launched", clientId: "c1" }));
  });

  it("still sets LIVE and audits when the client has no subscription", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ id: "p1", websiteId: "w1", clientId: "c1" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.subscription.findUnique.mockResolvedValue(null); // no subscription
    prismaMock.preview.update.mockResolvedValue({});

    await launchPreview("p1");

    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "LIVE" } }),
    );
  });
});
