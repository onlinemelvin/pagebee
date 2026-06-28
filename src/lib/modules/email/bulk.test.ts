import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./dispatch", () => ({
  dispatch: vi.fn().mockResolvedValue({ logId: "l1", providerId: "p1", status: "SENT" }),
}));
vi.mock("./categories", () => ({
  isMarketing: vi.fn().mockReturnValue(true),
}));

import {
  resolveSegment,
  segmentCount,
  createCampaign,
  updateCampaign,
  cancelCampaign,
  sendCampaign,
  createTemplate,
} from "./bulk";
import { dispatch } from "./dispatch";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveSegment", () => {
  it("deduplicates recipients with the same email address", async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "Biz 1", ownerEmail: "same@x.com", users: [] },
      { id: "c2", businessName: "Biz 2", ownerEmail: "same@x.com", users: [] },
    ] as never);

    const result = await resolveSegment({});
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("same@x.com");
  });

  it("excludes test accounts by default", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    await resolveSegment({});
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isTest: false }) }),
    );
  });

  it("includes test accounts when includeTest=true", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    await resolveSegment({ includeTest: true });
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ isTest: false }) }),
    );
  });

  it("filters by plan names when provided", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    await resolveSegment({ plans: ["NECTAR"] });
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscription: { plan: { name: { in: ["NECTAR"] } } } }),
      }),
    );
  });

  it("falls back to user email when ownerEmail is null", async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "Biz", ownerEmail: null, users: [{ user: { email: "user@x.com" } }] },
    ] as never);
    const result = await resolveSegment({});
    expect(result[0].email).toBe("user@x.com");
  });
});

describe("segmentCount", () => {
  it("returns the number of resolved recipients", async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "B", ownerEmail: "a@x.com", users: [] },
      { id: "c2", businessName: "C", ownerEmail: "b@x.com", users: [] },
    ] as never);
    expect(await segmentCount({})).toBe(2);
  });
});

describe("createCampaign", () => {
  it("sets status SCHEDULED when scheduledAt is provided", async () => {
    const scheduledAt = new Date("2030-01-01");
    prismaMock.emailCampaign.create.mockResolvedValue({ id: "c1", status: "SCHEDULED" } as never);
    await createCampaign({
      name: "Test", subject: "Hi", bodyHtml: "<p>x</p>", category: "ANNOUNCEMENT" as never,
      segment: {}, scheduledAt,
    });
    expect(prismaMock.emailCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED" }) }),
    );
  });

  it("sets status DRAFT when no scheduledAt", async () => {
    prismaMock.emailCampaign.create.mockResolvedValue({ id: "c1", status: "DRAFT" } as never);
    await createCampaign({
      name: "Test", subject: "Hi", bodyHtml: "<p>x</p>", category: "TIPS" as never, segment: {},
    });
    expect(prismaMock.emailCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT" }) }),
    );
  });
});

describe("updateCampaign", () => {
  it("throws not_found when campaign does not exist", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue(null);
    await expect(updateCampaign("x", { name: "new" })).rejects.toThrow("not_found");
  });

  it("throws already_sent when campaign is SENDING", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue({ status: "SENDING" } as never);
    await expect(updateCampaign("x", {})).rejects.toThrow("already_sent");
  });

  it("throws already_sent when campaign is SENT", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue({ status: "SENT" } as never);
    await expect(updateCampaign("x", {})).rejects.toThrow("already_sent");
  });

  it("updates a DRAFT campaign successfully", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue({ status: "DRAFT" } as never);
    prismaMock.emailCampaign.update.mockResolvedValue({ id: "c1" } as never);
    const result = await updateCampaign("c1", { name: "New Name" });
    expect(result).toEqual({ id: "c1" });
  });
});

describe("cancelCampaign", () => {
  it("throws not_found when campaign does not exist", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue(null);
    await expect(cancelCampaign("x")).rejects.toThrow("not_found");
  });

  it("throws already_sent when campaign is SENT", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue({ status: "SENT" } as never);
    await expect(cancelCampaign("x")).rejects.toThrow("already_sent");
  });

  it("cancels a SCHEDULED campaign", async () => {
    prismaMock.emailCampaign.findUnique.mockResolvedValue({ status: "SCHEDULED" } as never);
    prismaMock.emailCampaign.update.mockResolvedValue({ id: "c1", status: "CANCELLED" } as never);
    await cancelCampaign("c1");
    expect(prismaMock.emailCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
  });
});

describe("sendCampaign", () => {
  const mockCampaign = {
    id: "camp1",
    subject: "Campaign Subject",
    bodyHtml: "<p>body</p>",
    category: "ANNOUNCEMENT",
    segment: {},
  };

  it("throws not_sendable when the campaign cannot be claimed", async () => {
    prismaMock.emailCampaign.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(sendCampaign("camp1")).rejects.toThrow("not_sendable");
  });

  it("dispatches one email per recipient and returns correct counts", async () => {
    prismaMock.emailCampaign.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.emailCampaign.findUniqueOrThrow.mockResolvedValue(mockCampaign as never);
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "Biz1", ownerEmail: "a@x.com", users: [] },
      { id: "c2", businessName: "Biz2", ownerEmail: "b@x.com", users: [] },
    ] as never);
    vi.mocked(dispatch).mockResolvedValue({ logId: "l", providerId: "p", status: "SENT" });
    prismaMock.emailCampaign.update.mockResolvedValue({} as never);

    const result = await sendCampaign("camp1");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
    expect(result.suppressed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("counts SUPPRESSED dispatches in suppressed", async () => {
    prismaMock.emailCampaign.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.emailCampaign.findUniqueOrThrow.mockResolvedValue(mockCampaign as never);
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "B1", ownerEmail: "a@x.com", users: [] },
    ] as never);
    vi.mocked(dispatch).mockResolvedValue({ logId: "l", providerId: null, status: "SUPPRESSED" });
    prismaMock.emailCampaign.update.mockResolvedValue({} as never);

    const result = await sendCampaign("camp1");
    expect(result.suppressed).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("updates campaign to SENT after dispatching all recipients", async () => {
    prismaMock.emailCampaign.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.emailCampaign.findUniqueOrThrow.mockResolvedValue(mockCampaign as never);
    prismaMock.client.findMany.mockResolvedValue([
      { id: "c1", businessName: "B", ownerEmail: "a@x.com", users: [] },
    ] as never);
    vi.mocked(dispatch).mockResolvedValue({ logId: "l", providerId: "p", status: "SENT" });
    prismaMock.emailCampaign.update.mockResolvedValue({} as never);

    await sendCampaign("camp1");
    expect(prismaMock.emailCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
    );
  });
});

describe("createTemplate", () => {
  it("throws name_taken when a template with the same name already exists", async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue({ id: "existing" } as never);
    await expect(
      createTemplate({ name: "existing", subject: "s", bodyHtml: "<p>x</p>", category: "TIPS" as never }),
    ).rejects.toThrow("name_taken");
  });

  it("creates template when name is unique", async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue(null);
    prismaMock.emailTemplate.create.mockResolvedValue({ id: "t1" } as never);
    const result = await createTemplate({ name: "unique", subject: "s", bodyHtml: "<p>x</p>", category: "ANNOUNCEMENT" as never });
    expect(result).toEqual({ id: "t1" });
  });
});
