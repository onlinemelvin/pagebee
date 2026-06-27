import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";
import { repFunnelStats, repMonthlyStanding } from "./dashboard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("repFunnelStats", () => {
  it("rolls up prospect counts, overdue follow-ups, and commission earnings — scoped to the rep", async () => {
    prismaMock.prospect.groupBy.mockResolvedValue([
      { status: "new", _count: { _all: 3 } },
      { status: "closed", _count: { _all: 2 } },
    ]);
    prismaMock.followUp.count.mockResolvedValue(4);
    prismaMock.commissionRecord.groupBy.mockResolvedValue([
      { status: "PAID", _sum: { amount: 220 } },
      { status: "ELIGIBLE", _sum: { amount: 110 } },
    ]);

    const now = new Date("2026-06-26T00:00:00Z");
    const stats = await repFunnelStats("rep1", now);

    expect(stats.totalProspects).toBe(5);
    expect(stats.byStatus.new).toBe(3);
    expect(stats.byStatus.closed).toBe(2);
    expect(stats.byStatus.qualified).toBe(0); // zero-filled
    expect(stats.overdueFollowUps).toBe(4);
    expect(stats.earnings.paid).toBe(220);
    expect(stats.earnings.eligible).toBe(110);
    expect(stats.earnings.pending).toBe(0);

    // scoping assertions
    expect(prismaMock.prospect.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignments: { some: { employeeId: "rep1" } } } }),
    );
    expect(prismaMock.followUp.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignedToId: "rep1", completed: false, dueAt: { lte: now } } }),
    );
    expect(prismaMock.commissionRecord.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: "rep1" } }),
    );
  });
});

describe("repMonthlyStanding", () => {
  it("ranks the rep among peers and computes the gap to the leader", async () => {
    prismaMock.commissionRecord.groupBy.mockResolvedValue([
      { employeeId: "leader", _count: { _all: 5 } },
      { employeeId: "rep1", _count: { _all: 3 } },
      { employeeId: "other", _count: { _all: 4 } },
    ]);
    prismaMock.employee.count.mockResolvedValue(6);

    const s = await repMonthlyStanding("rep1", new Date("2026-06-15T00:00:00Z"));
    expect(s).toEqual({ closes: 3, rank: 3, totalReps: 6, leaderCloses: 5, toLeader: 2 });
  });

  it("reports rank 1 with no gap when the rep leads (and 0 closes handled)", async () => {
    prismaMock.commissionRecord.groupBy.mockResolvedValue([{ employeeId: "rep1", _count: { _all: 2 } }]);
    prismaMock.employee.count.mockResolvedValue(3);
    const s = await repMonthlyStanding("rep1", new Date("2026-06-15T00:00:00Z"));
    expect(s).toMatchObject({ closes: 2, rank: 1, leaderCloses: 2, toLeader: 0 });
  });
});
