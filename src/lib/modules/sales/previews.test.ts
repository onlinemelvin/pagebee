import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/slug", () => ({ uniqueClientSlug: vi.fn(async () => "joes-pizza") }));
vi.mock("@/lib/modules/website", async () => {
  const actual = await vi.importActual<typeof import("@/lib/modules/website")>("@/lib/modules/website");
  return { ...actual, startGeneration: vi.fn(async () => ({ jobId: "job1", websiteId: "web1" })) };
});

import { requestPreview, getProspectPreview } from "./previews";
import { startGeneration } from "@/lib/modules/website";

const intake = { about: "Best pizza in town", services: ["Dine-in", "Delivery"] };

beforeEach(() => {
  vi.clearAllMocks();
  // The global setup's resetAllMocks wipes these implementations; restore them each test.
  vi.mocked(startGeneration).mockResolvedValue({ jobId: "job1", websiteId: "web1" } as never);
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
});
