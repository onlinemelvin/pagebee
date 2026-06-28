import { prisma } from "@/lib/db";
import { PROSPECT_STATUSES } from "./schema";

export interface RepFunnelStats {
  byStatus: Record<string, number>;
  totalProspects: number;
  overdueFollowUps: number;
  earnings: { pending: number; eligible: number; approved: number; paid: number; clawedBack: number };
}

export interface RepStanding {
  closes: number; // the rep's converted clients this month
  rank: number; // 1-based
  totalReps: number;
  leaderCloses: number;
  toLeader: number; // closes needed to tie #1 (0 if leading)
}

/**
 * The rep's competitive standing this month — closes (converted clients) and rank among all active
 * reps, plus the gap to the leader. Anonymized on purpose: independent contractors see their own
 * position and the leader's number, never other reps' names/data. Motivational, privacy-safe.
 */
export async function repMonthlyStanding(repId: string, now: Date): Promise<RepStanding> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [grouped, totalReps] = await Promise.all([
    prisma.commissionRecord.groupBy({
      by: ["employeeId"],
      where: { basis: "setup_fee", createdAt: { gte: monthStart } },
      _count: { _all: true },
    }),
    prisma.employee.count({ where: { employeeType: "COMMISSION_REP", employmentStatus: "ACTIVE" } }),
  ]);

  const counts = new Map<string, number>();
  for (const g of grouped as Array<{ employeeId: string; _count: { _all: number } }>) {
    counts.set(g.employeeId, g._count._all);
  }
  const closes = counts.get(repId) ?? 0;
  const leaderCloses = counts.size ? Math.max(...counts.values()) : 0;
  const ahead = [...counts.values()].filter((c) => c > closes).length;

  return {
    closes,
    rank: ahead + 1,
    totalReps: Math.max(totalReps, 1),
    leaderCloses,
    toLeader: Math.max(0, leaderCloses - closes),
  };
}

/**
 * Headline numbers for a rep's dashboard: prospect counts per funnel stage, overdue follow-ups, and
 * commission earnings grouped by status. All scoped to the rep's `Employee.id`. The `now` argument is
 * injected (not read from the clock here) so callers/tests stay deterministic.
 */
export async function repFunnelStats(repId: string, now: Date): Promise<RepFunnelStats> {
  const [statusGroups, overdueFollowUps, commissionGroups] = await Promise.all([
    prisma.prospect.groupBy({
      by: ["status"],
      where: { assignments: { some: { employeeId: repId } } },
      _count: { _all: true },
    }),
    prisma.followUp.count({ where: { assignedToId: repId, completed: false, dueAt: { lte: now } } }),
    prisma.commissionRecord.groupBy({
      by: ["status"],
      where: { employeeId: repId },
      _sum: { amount: true },
    }),
  ]);

  const byStatus: Record<string, number> = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s, 0]));
  let totalProspects = 0;
  for (const g of statusGroups as Array<{ status: string; _count: { _all: number } }>) {
    byStatus[g.status] = g._count._all;
    totalProspects += g._count._all;
  }

  const earnings = { pending: 0, eligible: 0, approved: 0, paid: 0, clawedBack: 0 };
  const map: Record<string, keyof typeof earnings> = {
    PENDING: "pending",
    ELIGIBLE: "eligible",
    APPROVED: "approved",
    PAID: "paid",
    CLAWED_BACK: "clawedBack",
  };
  for (const g of commissionGroups as Array<{ status: string; _sum: { amount: unknown } }>) {
    const key = map[g.status];
    if (key) earnings[key] = Number(g._sum.amount ?? 0);
  }

  return { byStatus, totalProspects, overdueFollowUps, earnings };
}
