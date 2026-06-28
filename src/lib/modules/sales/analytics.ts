import { prisma } from "@/lib/db";

/**
 * Sales analytics (Phase 2). Read-only rollups for the admin: per-rep performance (funnel, revenue
 * sourced, commission) and discount impact (does discounting actually lift conversion?). All amounts
 * returned in dollars; quote pricing is integer cents in the DB.
 */

const CONVERTED = "CONVERTED";
// A quote counts as "sent" once it's left the rep's hands (any status past DRAFT/NEEDS_APPROVAL/APPROVED).
const SENT_STATES = new Set(["SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"]);

export interface RepPerformance {
  repId: string;
  repName: string;
  prospects: number;
  quotes: number;
  quotesSent: number;
  conversions: number;
  conversionRate: number; // conversions / prospects, 0..1
  setupRevenue: number; // $ collected setup across converted clients
  monthlyRevenue: number; // $ recurring/mo across converted clients
  commissionPaid: number;
  commissionOutstanding: number; // pending + eligible + approved
}

export interface DiscountImpact {
  discounted: { quotes: number; conversions: number; conversionRate: number };
  fullPrice: { quotes: number; conversions: number; conversionRate: number };
  totalSetupDiscount: number; // $ given away on setup fees
  avgSetupDiscount: number; // $ per discounted quote
}

const rate = (num: number, denom: number) => (denom > 0 ? Math.round((num / denom) * 1000) / 1000 : 0);

/** Per-rep performance rollup, highest revenue first. */
export async function repPerformance(): Promise<RepPerformance[]> {
  const [reps, quotes, clients, commissions] = await Promise.all([
    prisma.employee.findMany({
      where: { employeeType: "COMMISSION_REP" },
      select: { id: true, user: { select: { name: true } }, _count: { select: { salesAssignments: true } } },
    }),
    prisma.quote.findMany({ select: { salesRepId: true, status: true } }),
    prisma.client.findMany({
      where: { sourceQuoteId: { not: null } },
      select: {
        sourceQuote: { select: { salesRepId: true } },
        subscription: { select: { agreedSetupFee: true, agreedMonthlyFee: true } },
      },
    }),
    prisma.commissionRecord.groupBy({ by: ["employeeId", "status"], _sum: { amount: true } }),
  ]);

  const quoteAgg = new Map<string, { total: number; sent: number; converted: number }>();
  for (const q of quotes) {
    const a = quoteAgg.get(q.salesRepId) ?? { total: 0, sent: 0, converted: 0 };
    a.total++;
    if (SENT_STATES.has(q.status)) a.sent++;
    if (q.status === CONVERTED) a.converted++;
    quoteAgg.set(q.salesRepId, a);
  }

  const revenue = new Map<string, { setup: number; monthly: number }>();
  for (const c of clients) {
    const repId = c.sourceQuote?.salesRepId;
    if (!repId) continue;
    const r = revenue.get(repId) ?? { setup: 0, monthly: 0 };
    r.setup += (c.subscription?.agreedSetupFee ?? 0) / 100;
    r.monthly += (c.subscription?.agreedMonthlyFee ?? 0) / 100;
    revenue.set(repId, r);
  }

  const commission = new Map<string, { paid: number; outstanding: number }>();
  for (const g of commissions as Array<{ employeeId: string; status: string; _sum: { amount: unknown } }>) {
    const amt = Number(g._sum.amount ?? 0);
    const c = commission.get(g.employeeId) ?? { paid: 0, outstanding: 0 };
    if (g.status === "PAID") c.paid += amt;
    else if (g.status === "PENDING" || g.status === "ELIGIBLE" || g.status === "APPROVED") c.outstanding += amt;
    commission.set(g.employeeId, c);
  }

  return reps
    .map((r) => {
      const q = quoteAgg.get(r.id) ?? { total: 0, sent: 0, converted: 0 };
      const rev = revenue.get(r.id) ?? { setup: 0, monthly: 0 };
      const com = commission.get(r.id) ?? { paid: 0, outstanding: 0 };
      const prospects = r._count.salesAssignments;
      return {
        repId: r.id,
        repName: r.user?.name ?? "—",
        prospects,
        quotes: q.total,
        quotesSent: q.sent,
        conversions: q.converted,
        conversionRate: rate(q.converted, prospects),
        setupRevenue: rev.setup,
        monthlyRevenue: rev.monthly,
        commissionPaid: com.paid,
        commissionOutstanding: com.outstanding,
      };
    })
    .sort((a, b) => b.setupRevenue + b.monthlyRevenue - (a.setupRevenue + a.monthlyRevenue));
}

/** Discount impact: conversion of discounted vs full-price quotes, and total/avg setup discount. */
export async function discountImpact(): Promise<DiscountImpact> {
  const quotes = await prisma.quote.findMany({
    select: { status: true, listedSetupFee: true, offeredSetupFee: true, listedMonthlyFee: true, offeredMonthlyFee: true },
  });

  const disc = { quotes: 0, conversions: 0 };
  const full = { quotes: 0, conversions: 0 };
  let totalSetupDiscountCents = 0;
  let discountedCount = 0;

  for (const q of quotes) {
    const setupDisc = Math.max(0, q.listedSetupFee - q.offeredSetupFee);
    const isDiscounted = setupDisc > 0 || q.offeredMonthlyFee < q.listedMonthlyFee;
    const bucket = isDiscounted ? disc : full;
    bucket.quotes++;
    if (q.status === CONVERTED) bucket.conversions++;
    if (isDiscounted) {
      discountedCount++;
      totalSetupDiscountCents += setupDisc;
    }
  }

  return {
    discounted: { ...disc, conversionRate: rate(disc.conversions, disc.quotes) },
    fullPrice: { ...full, conversionRate: rate(full.conversions, full.quotes) },
    totalSetupDiscount: totalSetupDiscountCents / 100,
    avgSetupDiscount: discountedCount > 0 ? Math.round((totalSetupDiscountCents / discountedCount) / 100 * 100) / 100 : 0,
  };
}
