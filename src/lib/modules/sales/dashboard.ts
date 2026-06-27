import { prisma } from "@/lib/db";
import { PROSPECT_STATUSES } from "./schema";

export interface RepFunnelStats {
  byStatus: Record<string, number>;
  totalProspects: number;
  overdueFollowUps: number;
  earnings: { pending: number; eligible: number; approved: number; paid: number; clawedBack: number };
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
