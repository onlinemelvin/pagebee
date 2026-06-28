import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/slug", () => ({ uniqueClientSlug: vi.fn(async () => "joes-pizza") }));
vi.mock("@/lib/modules/website", async () => {
  const actual = await vi.importActual<typeof import("@/lib/modules/website")>("@/lib/modules/website");
  return {
    ...actual,
    startGeneration: vi.fn(async () => ({ jobId: "job1", websiteId: "web1" })),
    claimAndRun: vi.fn(async () => {}),
    regenerateFromScratch: vi.fn(async () => ({ ok: true })),
  };
});
vi.mock("@/lib/modules/email", () => ({ appBase: () => "https://app.test" }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendPreviewToProspect: vi.fn(async () => {}) }));

import { requestPreview, getProspectPreview, markPreviewSent, repRegeneratePreview, repRequestChanges, emailPreviewToProspect } from "./previews";
import { startGeneration, regenerateFromScratch, claimAndRun } from "@/lib/modules/website";
import { sendPreviewToProspect } from "@/lib/modules/email/notifications";

const intake = { about: "Best pizza in town", services: ["Dine-in", "Delivery"] };

beforeEach(() => {
  vi.clearAllMocks();
  // The global setup's resetAllMocks wipes these implementations; restore them each test.
  vi.mocked(startGeneration).mockResolvedValue({ jobId: "job1", websiteId: "web1" } as never);
  vi.mocked(claimAndRun).mockResolvedValue(undefined as never);
  vi.mocked(regenerateFromScratch).mockResolvedValue({ ok: true } as never);
  vi.mocked(sendPreviewToProspect).mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("requestPreview", () => {
  function wire() {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.prospect.findUnique.mockResolvedValue({
      businessName: "Joe's Pizza",
      businessType: "Restaurant",
      contactName: "Joe",
      email: "joe@x.com",
      phone: "415",
    });
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", setupFee: 69900, monthlyFee: 8900 });
    prismaMock.client.create.mockResolvedValue({ id: "c1" });
    prismaMock.subscription.create.mockResolvedValue({});
    prismaMock.preview.create.mockResolvedValue({ id: "pv1", publicToken: "tok123" });
  }

  it("creates a provisional client + subscription, starts generation, and records the preview", async () => {
    wire();
    const res = await requestPreview("rep1", { prospectId: "p1", selectedPlan: "HONEY", intake }, { userId: "u1" });

    expect(res).toMatchObject({ previewId: "pv1", jobId: "job1", clientId: "c1", publicToken: "tok123" });
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isTest: true, prospectId: "p1", businessName: "Joe's Pizza" }) }),
    );
    expect(prismaMock.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c1", status: "SETUP_PENDING", setupFeePaid: false }) }),
    );
    expect(startGeneration).toHaveBeenCalledWith("c1", expect.objectContaining({ previewPlan: "HONEY", about: "Best pizza in town" }));
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prospectId: "p1", clientId: "c1", websiteId: "web1", status: "PREVIEW_GENERATING", assignedSalesRepId: "rep1" }),
      }),
    );
  });

  it("404 when the rep isn't assigned to the prospect", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue(null);
    await expect(requestPreview("rep1", { prospectId: "p1", selectedPlan: "HONEY", intake })).rejects.toMatchObject({
      code: "prospect_not_found",
      status: 404,
    });
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("409 when a client already exists for the prospect", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.prospect.findUnique.mockResolvedValue({ businessName: "Joe's Pizza", businessType: null, contactName: null, email: null, phone: null });
    prismaMock.client.findFirst.mockResolvedValue({ id: "existing" });
    await expect(requestPreview("rep1", { prospectId: "p1", selectedPlan: "HONEY", intake })).rejects.toMatchObject({
      code: "preview_exists",
      status: 409,
    });
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });
});

describe("markPreviewSent", () => {
  it("marks the preview SENT, stamps sentAt, advances the prospect, returns the token", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", prospectId: "p1", publicToken: "tok", sentAt: null });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.prospect.update.mockResolvedValue({});
    const res = await markPreviewSent("rep1", "pv1");
    expect(res).toEqual({ publicToken: "tok" });
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pv1" }, data: expect.objectContaining({ status: "PREVIEW_SENT" }) }),
    );
    expect(prismaMock.prospect.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "preview_sent" } });
  });

  it("404 when the preview isn't the rep's", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    await expect(markPreviewSent("rep1", "pv1")).rejects.toMatchObject({ code: "preview_not_found", status: 404 });
  });
});

describe("getProspectPreview", () => {
  it("returns the rep's preview, scoped", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", status: "PREVIEW_READY", publicToken: "tok" });
    const p = await getProspectPreview("rep1", "p1");
    expect(p).toMatchObject({ id: "pv1", status: "PREVIEW_READY" });
    expect(prismaMock.preview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { prospectId: "p1", assignedSalesRepId: "rep1" } }),
    );
  });

  it("settles IN_REVIEW to PREVIEW_READY (rep previews skip admin review) once a version exists", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", status: "IN_REVIEW", websiteId: "web1", publicToken: "tok" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.preview.update.mockResolvedValue({});
    const p = await getProspectPreview("rep1", "p1");
    expect(p?.status).toBe("PREVIEW_READY");
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pv1" }, data: expect.objectContaining({ status: "PREVIEW_READY" }) }),
    );
  });
});

describe("repRegeneratePreview", () => {
  it("rebuilds from the latest version via the admin engine, rep-scoped", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", websiteId: "web1", clientId: "c1", status: "PREVIEW_READY" });
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v9" });
    prismaMock.preview.update.mockResolvedValue({});
    const res = await repRegeneratePreview("rep1", "pv1", { userId: "u1" });
    expect(res).toEqual({ ok: true });
    expect(regenerateFromScratch).toHaveBeenCalledWith("v9", "u1");
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PREVIEW_GENERATING" } }),
    );
  });

  it("409 while already generating", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", websiteId: "web1", clientId: "c1", status: "PREVIEW_GENERATING" });
    await expect(repRegeneratePreview("rep1", "pv1")).rejects.toMatchObject({ code: "already_generating", status: 409 });
  });
});

describe("repRequestChanges", () => {
  it("starts an auto-released revision from the rep's note", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", websiteId: "web1", clientId: "c1", status: "PREVIEW_READY" });
    prismaMock.websiteGenerationJob.findFirst.mockResolvedValue({ inputIntake: { about: "x" } });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.previewRevision.create.mockResolvedValue({});
    const res = await repRequestChanges("rep1", "pv1", "make it bolder", { userId: "u1" });
    expect(res).toMatchObject({ ok: true, jobId: "job1" });
    expect(startGeneration).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ revisionNote: "make it bolder", autoRelease: true }),
    );
  });

  it("400 on empty note", async () => {
    await expect(repRequestChanges("rep1", "pv1", "  ")).rejects.toMatchObject({ code: "no_content", status: 400 });
  });
});

describe("emailPreviewToProspect", () => {
  it("emails the prospect the share link and marks PREVIEW_SENT", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", prospectId: "p1", publicToken: "tok", sentAt: null });
    prismaMock.prospect.findUnique.mockResolvedValue({ email: "joe@x.com", businessName: "Joe's", contactName: "Joe" });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.prospect.update.mockResolvedValue({});
    const res = await emailPreviewToProspect("rep1", "pv1", { userId: "u1" });
    expect(res).toEqual({ ok: true, to: "joe@x.com" });
    expect(sendPreviewToProspect).toHaveBeenCalledWith(
      "joe@x.com",
      expect.objectContaining({ businessName: "Joe's", previewUrl: "https://app.test/p/tok" }),
    );
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PREVIEW_SENT" }) }),
    );
  });

  it("400 when the prospect has no email", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", prospectId: "p1", publicToken: "tok", sentAt: null });
    prismaMock.prospect.findUnique.mockResolvedValue({ email: null, businessName: "Joe's", contactName: null });
    await expect(emailPreviewToProspect("rep1", "pv1")).rejects.toMatchObject({ code: "no_prospect_email", status: 400 });
    expect(sendPreviewToProspect).not.toHaveBeenCalled();
  });
});
