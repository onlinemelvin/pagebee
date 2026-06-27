import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// analytics.ts only uses prisma — no other side-effect modules to mock
import { getGenerationAnalytics } from "./analytics";

beforeEach(() => {
  vi.clearAllMocks();
});

/** Build a minimal groupBy row shape. */
function statusRow(status: string, count: number) {
  return { status, _count: { _all: count } };
}

describe("getGenerationAnalytics", () => {
  it("returns zeroed metrics when there are no jobs", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics(30);

    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.stuck).toBe(0);
    expect(result.inFlight).toBe(0);
    expect(result.successRatePct).toBeNull();
    expect(result.duration).toBeNull();
    expect(result.topErrors).toEqual([]);
    expect(result.recentFailures).toEqual([]);
    expect(result.windowDays).toBe(30);
  });

  it("calculates success rate correctly from status buckets", async () => {
    prismaMock.websiteGenerationJob.groupBy
      .mockResolvedValueOnce([
        statusRow("NEEDS_REVIEW", 8),
        statusRow("FAILED", 2),
      ])
      .mockResolvedValue([]); // errorGroups
    prismaMock.websiteGenerationJob.count
      .mockResolvedValueOnce(0) // stuck count
      .mockResolvedValueOnce(0); // offloadCount
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics();

    expect(result.total).toBe(10);
    expect(result.completed).toBe(8);
    expect(result.failed).toBe(2);
    // completed / (completed + failed + stuck) = 8 / 10 = 80%
    expect(result.successRatePct).toBe(80);
  });

  it("counts stuck jobs and subtracts them from inFlight", async () => {
    prismaMock.websiteGenerationJob.groupBy
      .mockResolvedValueOnce([
        statusRow("GENERATING", 5),
        statusRow("QUEUED", 3),
      ])
      .mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count
      .mockResolvedValueOnce(2) // stuck = 2
      .mockResolvedValueOnce(0); // offloadCount
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics();

    expect(result.stuck).toBe(2);
    expect(result.inFlight).toBe(6); // 5 + 3 - 2
  });

  it("does not let inFlight go negative when stuck > raw in-flight count", async () => {
    prismaMock.websiteGenerationJob.groupBy
      .mockResolvedValueOnce([statusRow("GENERATING", 1)])
      .mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count
      .mockResolvedValueOnce(3) // stuck > total in-flight
      .mockResolvedValueOnce(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics();

    expect(result.inFlight).toBe(0); // Math.max(0, ...)
  });

  it("computes duration stats from raw query rows", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([{ secs: 10 }, { secs: 30 }, { secs: 50 }]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics();

    expect(result.duration).not.toBeNull();
    expect(result.duration!.count).toBe(3);
    // avg of [10, 30, 50] = 30
    expect(result.duration!.avgSec).toBe(30);
    expect(result.duration!.maxSec).toBe(50);
  });

  it("maps topErrors from the error groupBy", async () => {
    const errorGroup = [{ error: "timeout", _count: { _all: 5 } }, { error: null, _count: { _all: 2 } }];
    prismaMock.websiteGenerationJob.groupBy
      .mockResolvedValueOnce([]) // byStatus
      .mockResolvedValueOnce(errorGroup); // errorGroups
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics();

    expect(result.topErrors).toEqual([
      { error: "timeout", count: 5 },
      { error: "(unknown)", count: 2 },
    ]);
  });

  it("builds daily buckets bucketed by date", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    const today = new Date();
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([
      { createdAt: today, status: "NEEDS_REVIEW" },
      { createdAt: today, status: "FAILED" },
    ]);

    const result = await getGenerationAnalytics(7);

    // Should have 7 days
    expect(result.daily).toHaveLength(7);
    const todayKey = today.toISOString().slice(0, 10);
    const todayBucket = result.daily.find((d) => d.date === todayKey);
    expect(todayBucket?.completed).toBe(1);
    expect(todayBucket?.failed).toBe(1);
  });

  it("maps recentFailures with business name from nested relation", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    const failRow = {
      id: "j1",
      error: "boom",
      createdAt: new Date("2024-01-01"),
      website: { client: { businessName: "Acme Plumbing" } },
    };
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([failRow]);

    const result = await getGenerationAnalytics();

    expect(result.recentFailures).toHaveLength(1);
    expect(result.recentFailures[0].business).toBe("Acme Plumbing");
    expect(result.recentFailures[0].error).toBe("boom");
  });

  it("handles missing website relation gracefully (null business)", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([
      { id: "j2", error: null, createdAt: new Date(), website: null },
    ]);

    const result = await getGenerationAnalytics();

    expect(result.recentFailures[0].business).toBeNull();
  });

  it("caps daily buckets at 14 days even for a 30-day window", async () => {
    prismaMock.websiteGenerationJob.groupBy.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.websiteGenerationJob.findMany.mockResolvedValue([]);

    const result = await getGenerationAnalytics(30);

    expect(result.daily).toHaveLength(14);
  });
});
