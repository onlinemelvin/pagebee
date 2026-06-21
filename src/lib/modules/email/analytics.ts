import { prisma } from "@/lib/db";
import type { EmailCategory, DeliveryStatus, Prisma } from "@prisma/client";

export interface EmailOverview {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  failed: number;
  deliveryRate: number; // delivered / sent
  openRate: number; // opened / delivered
  bounceRate: number; // bounced / sent
}

function sinceFor(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Aggregate delivery/open/bounce metrics over the last `days` (default 30). */
export async function emailOverview(days = 30): Promise<EmailOverview> {
  const createdAt = { gte: sinceFor(days) };
  const [total, sent, delivered, opened, bounced, failed] = await Promise.all([
    prisma.emailLog.count({ where: { createdAt } }),
    prisma.emailLog.count({ where: { createdAt, OR: [{ sentAt: { not: null } }, { status: { in: ["SENT", "DELIVERED", "OPENED"] } }] } }),
    prisma.emailLog.count({ where: { createdAt, deliveredAt: { not: null } } }),
    prisma.emailLog.count({ where: { createdAt, openedAt: { not: null } } }),
    prisma.emailLog.count({ where: { createdAt, OR: [{ bouncedAt: { not: null } }, { status: "BOUNCED" }] } }),
    prisma.emailLog.count({ where: { createdAt, status: "FAILED" } }),
  ]);
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    total,
    sent,
    delivered,
    opened,
    bounced,
    failed,
    deliveryRate: rate(delivered, sent),
    openRate: rate(opened, delivered),
    bounceRate: rate(bounced, sent),
  };
}

/** Send/open counts grouped by category for the last `days`. */
export async function emailByCategory(days = 30): Promise<Array<{ category: EmailCategory; sent: number; opened: number }>> {
  const createdAt = { gte: sinceFor(days) };
  const grouped = await prisma.emailLog.groupBy({
    by: ["category"],
    where: { createdAt },
    _count: { _all: true },
  });
  const opened = await prisma.emailLog.groupBy({
    by: ["category"],
    where: { createdAt, openedAt: { not: null } },
    _count: { _all: true },
  });
  const openMap = new Map(opened.map((o) => [o.category, o._count._all]));
  return grouped
    .map((g) => ({ category: g.category, sent: g._count._all, opened: openMap.get(g.category) ?? 0 }))
    .sort((a, b) => b.sent - a.sent);
}

export interface EmailLogFilter {
  status?: DeliveryStatus;
  category?: EmailCategory;
  campaignId?: string;
  search?: string; // matches toEmail or subject
  take?: number;
  cursor?: string;
}

/** Paginated email log list for the admin dashboard (cursor on id). */
export async function listEmailLogs(filter: EmailLogFilter = {}) {
  const where: Prisma.EmailLogWhereInput = {};
  if (filter.status) where.status = filter.status;
  if (filter.category) where.category = filter.category;
  if (filter.campaignId) where.campaignId = filter.campaignId;
  if (filter.search) {
    where.OR = [
      { toEmail: { contains: filter.search, mode: "insensitive" } },
      { subject: { contains: filter.search, mode: "insensitive" } },
    ];
  }
  const take = Math.min(filter.take ?? 50, 200);
  const rows = await prisma.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > take ? rows[take].id : null;
  return { rows: rows.slice(0, take), nextCursor };
}
