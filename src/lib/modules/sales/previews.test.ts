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

import { requestPreview, getProspectPreview, listProspectPreviews, setPreviewDiscount, decidePreviewDiscountApproval, markPreviewSent, repRegeneratePreview, repRequestChanges, emailPreviewToProspect } from "./previews";
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
    prismaMock.preview.findFirst.mockResolvedValue(null);
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

  it("409 when a preview already exists for the SAME plan", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.prospect.findUnique.mockResolvedValue({ businessName: "Joe's Pizza", businessType: null, contactName: null, email: null, phone: null });
    prismaMock.preview.findFirst.mockResolvedValue({ id: "existing" });
    await expect(requestPreview("rep1", { prospectId: "p1", selectedPlan: "HONEY", intake })).rejects.toMatchObject({
      code: "preview_exists",
      status: 409,
    });
    expect(prismaMock.preview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ prospectId: "p1", selectedPlan: "HONEY" }) }),
    );
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("allows a second preview for a DIFFERENT plan and applies an in-authority setup discount", async () => {
    wire();
    // NECTAR list $399, floor $299 → 10% (→ $359.10) is within rep authority, applies immediately.
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", setupFee: 39900, monthlyFee: 3900 });
    await requestPreview("rep1", { prospectId: "p1", selectedPlan: "NECTAR", setupDiscountPct: 10, intake });
    expect(prismaMock.client.create).toHaveBeenCalled();
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selectedPlan: "NECTAR", setupDiscountPct: 10, pendingDiscountPct: null }) }),
    );
  });

  it("sends a below-floor opening discount to admin approval (effective stays 0)", async () => {
    wire();
    // NECTAR list $399, floor $299 → 50% (→ $199.50) is below the floor → needs approval.
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", setupFee: 39900, monthlyFee: 3900 });
    const res = await requestPreview("rep1", { prospectId: "p1", selectedPlan: "NECTAR", setupDiscountPct: 50, intake });
    expect(res).toMatchObject({ discountPending: true });
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          setupDiscountPct: 0,
          pendingDiscountPct: 50,
          discountApprovals: { create: { requestedById: "rep1", requestedPct: 50, requestedMonthlyPct: 0 } },
        }),
      }),
    );
  });

  it("always routes a monthly promo to approval (even with no setup discount)", async () => {
    wire();
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", setupFee: 39900, monthlyFee: 3900 });
    const res = await requestPreview("rep1", { prospectId: "p1", selectedPlan: "NECTAR", monthlyDiscountPct: 15, intake });
    expect(res).toMatchObject({ discountPending: true });
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthlyDiscountPct: 0,
          pendingMonthlyPct: 15,
          discountApprovals: { create: { requestedById: "rep1", requestedPct: 0, requestedMonthlyPct: 15 } },
        }),
      }),
    );
  });

  it("defaults the setup discount to 0 when omitted", async () => {
    wire();
    await requestPreview("rep1", { prospectId: "p1", selectedPlan: "NECTAR", intake });
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ setupDiscountPct: 0, pendingDiscountPct: null }) }),
    );
  });
});

describe("listProspectPreviews", () => {
  it("returns every rep-owned preview for the prospect, settling generating ones", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.preview.findMany.mockResolvedValue([
      { id: "pv1", status: "PREVIEW_READY", websiteId: "web1" },
      { id: "pv2", status: "PREVIEW_GENERATING", websiteId: "web2" },
    ]);
    prismaMock.websiteVersion.findFirst.mockResolvedValue({ id: "v1" });
    prismaMock.preview.update.mockResolvedValue({});
    const rows = await listProspectPreviews("rep1", "p1");
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("PREVIEW_READY"); // pv2 settled
    expect(prismaMock.preview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { prospectId: "p1", assignedSalesRepId: "rep1" } }),
    );
  });
});

describe("setPreviewDiscount", () => {
  function wireDiscount() {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", selectedPlan: "HONEY" });
    prismaMock.plan.findUnique.mockResolvedValue({ setupFee: 69900, monthlyFee: 8900 }); // HONEY list $699, floor $599
    prismaMock.previewDiscountApproval.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.previewDiscountApproval.create.mockResolvedValue({ id: "ap1" });
  }

  it("applies a within-authority setup discount immediately", async () => {
    wireDiscount();
    // 10% → $629.10, still ≥ the $599 floor; no monthly promo.
    const res = await setPreviewDiscount("rep1", "pv1", 10, 0);
    expect(res).toEqual({ ok: true, pending: false, setupDiscountPct: 10 });
    expect(prismaMock.preview.update).toHaveBeenCalledWith({ where: { id: "pv1" }, data: { setupDiscountPct: 10, pendingDiscountPct: null, pendingMonthlyPct: null } });
    expect(prismaMock.previewDiscountApproval.create).not.toHaveBeenCalled();
  });

  it("routes a below-floor setup discount to admin approval and leaves the in-force discount untouched", async () => {
    wireDiscount();
    // 50% → $349.50, below the $599 floor → needs approval.
    const res = await setPreviewDiscount("rep1", "pv1", 50, 0);
    expect(res).toEqual({ ok: true, pending: true, requestedPct: 50, requestedMonthlyPct: 0 });
    expect(prismaMock.preview.update).toHaveBeenCalledWith({ where: { id: "pv1" }, data: { pendingDiscountPct: 50, pendingMonthlyPct: 0 } });
    expect(prismaMock.previewDiscountApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { previewId: "pv1", requestedById: "rep1", requestedPct: 50, requestedMonthlyPct: 0 } }),
    );
    // The effective setupDiscountPct is never written on the approval path.
    expect(prismaMock.preview.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ setupDiscountPct: expect.anything() }) }),
    );
  });

  it("routes ANY monthly promo to approval, even when the setup discount is within authority", async () => {
    wireDiscount();
    // Setup 10% is fine on its own, but the 20% monthly promo forces the whole request to approval.
    const res = await setPreviewDiscount("rep1", "pv1", 10, 20);
    expect(res).toEqual({ ok: true, pending: true, requestedPct: 10, requestedMonthlyPct: 20 });
    expect(prismaMock.preview.update).toHaveBeenCalledWith({ where: { id: "pv1" }, data: { pendingDiscountPct: 10, pendingMonthlyPct: 20 } });
    expect(prismaMock.previewDiscountApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { previewId: "pv1", requestedById: "rep1", requestedPct: 10, requestedMonthlyPct: 20 } }),
    );
  });

  it("404 when the preview isn't the rep's", async () => {
    prismaMock.preview.findFirst.mockResolvedValue(null);
    await expect(setPreviewDiscount("rep1", "pv1", 10)).rejects.toMatchObject({ code: "preview_not_found", status: 404 });
  });
});

describe("decidePreviewDiscountApproval", () => {
  it("APPROVED puts both the setup + monthly discounts in force and clears the pending markers", async () => {
    prismaMock.previewDiscountApproval.findUnique.mockResolvedValue({ id: "ap1", previewId: "pv1", requestedPct: 40, requestedMonthlyPct: 20, status: "PENDING" });
    prismaMock.previewDiscountApproval.update.mockResolvedValue({ id: "ap1", status: "APPROVED" });
    prismaMock.preview.update.mockResolvedValue({});
    const res = await decidePreviewDiscountApproval("ap1", { decision: "APPROVED" }, { userId: "admin1" });
    expect(res).toMatchObject({ status: "APPROVED" });
    expect(prismaMock.preview.update).toHaveBeenCalledWith({ where: { id: "pv1" }, data: { pendingDiscountPct: null, pendingMonthlyPct: null, setupDiscountPct: 40, monthlyDiscountPct: 20 } });
  });

  it("REJECTED clears the pending markers without changing the in-force discounts", async () => {
    prismaMock.previewDiscountApproval.findUnique.mockResolvedValue({ id: "ap1", previewId: "pv1", requestedPct: 40, requestedMonthlyPct: 20, status: "PENDING" });
    prismaMock.previewDiscountApproval.update.mockResolvedValue({ id: "ap1", status: "REJECTED" });
    prismaMock.preview.update.mockResolvedValue({});
    await decidePreviewDiscountApproval("ap1", { decision: "REJECTED" }, { userId: "admin1" });
    expect(prismaMock.preview.update).toHaveBeenCalledWith({ where: { id: "pv1" }, data: { pendingDiscountPct: null, pendingMonthlyPct: null } });
  });

  it("409 when the approval was already decided", async () => {
    prismaMock.previewDiscountApproval.findUnique.mockResolvedValue({ id: "ap1", previewId: "pv1", requestedPct: 40, requestedMonthlyPct: 0, status: "APPROVED" });
    await expect(decidePreviewDiscountApproval("ap1", { decision: "APPROVED" }, { userId: "admin1" })).rejects.toMatchObject({ code: "already_decided", status: 409 });
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
    prismaMock.prospectActivity.create.mockResolvedValue({ id: "act1" });
    const res = await emailPreviewToProspect("rep1", "pv1", { userId: "u1" });
    expect(res).toEqual({ ok: true, to: "joe@x.com" });
    expect(sendPreviewToProspect).toHaveBeenCalledWith(
      "joe@x.com",
      expect.objectContaining({ businessName: "Joe's", previewUrl: "https://app.test/p/tok" }),
    );
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PREVIEW_SENT" }) }),
    );
    // The send is recorded on the prospect's timeline.
    expect(prismaMock.prospectActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prospectId: "p1", type: "email", summary: "Preview emailed to joe@x.com", createdById: "u1" }) }),
    );
  });

  it("400 when the prospect has no email", async () => {
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", prospectId: "p1", publicToken: "tok", sentAt: null });
    prismaMock.prospect.findUnique.mockResolvedValue({ email: null, businessName: "Joe's", contactName: null });
    await expect(emailPreviewToProspect("rep1", "pv1")).rejects.toMatchObject({ code: "no_prospect_email", status: 400 });
    expect(sendPreviewToProspect).not.toHaveBeenCalled();
  });
});
