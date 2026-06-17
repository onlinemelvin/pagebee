import { prisma } from "@/lib/db";

export interface MonthPoint {
  key: string; // YYYY-MM
  label: string; // "Jan"
  collected: number; // cents paid in this month
  invoiced: number; // cents invoiced in this month
}
export interface FinanceAnalytics {
  revenueByMonth: MonthPoint[];
  quote: { sent: number; accepted: number; declined: number; pending: number; acceptanceRate: number };
  topCustomers: { name: string; total: number }[];
  topItems: { description: string; total: number }[];
  collected12mo: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Owner-facing analytics for client analysis: revenue trend, quote acceptance, top customers/items. */
export async function getFinanceAnalytics(clientId: string): Promise<FinanceAnalytics> {
  const now = new Date();
  // Build the last 12 month buckets (oldest → newest).
  const buckets: MonthPoint[] = [];
  const index = new Map<string, MonthPoint>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const point: MonthPoint = { key: ymKey(d), label: MONTHS[d.getUTCMonth()], collected: 0, invoiced: 0 };
    buckets.push(point);
    index.set(point.key, point);
  }
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const invoices = await prisma.invoice.findMany({
    where: { clientId, kind: "CLIENT_CUSTOMER" },
    select: {
      docType: true,
      status: true,
      total: true,
      amountPaid: true,
      issueDate: true,
      createdAt: true,
      paidAt: true,
      customer: { select: { name: true } },
      lineItems: { select: { description: true, amount: true } },
    },
    take: 5000,
  });

  const customerTotals = new Map<string, number>();
  const itemTotals = new Map<string, number>();
  let collected12mo = 0;
  const quote = { sent: 0, accepted: 0, declined: 0, pending: 0, acceptanceRate: 0 };

  for (const inv of invoices) {
    // Revenue trend.
    if (inv.amountPaid > 0 && inv.paidAt && inv.paidAt >= since) {
      const b = index.get(ymKey(inv.paidAt));
      if (b) b.collected += inv.amountPaid;
      collected12mo += inv.amountPaid;
      // Top customers / items use collected revenue.
      const name = inv.customer?.name ?? "—";
      customerTotals.set(name, (customerTotals.get(name) ?? 0) + inv.amountPaid);
      for (const li of inv.lineItems) itemTotals.set(li.description, (itemTotals.get(li.description) ?? 0) + li.amount);
    }
    if (inv.docType === "INVOICE") {
      const issued = inv.issueDate ?? inv.createdAt;
      if (issued >= since) {
        const b = index.get(ymKey(issued));
        if (b) b.invoiced += inv.total;
      }
    }
    // Quote/estimate acceptance.
    if (inv.docType === "ESTIMATE" || inv.docType === "QUOTE") {
      if (inv.status !== "DRAFT") quote.sent += 1;
      if (inv.status === "ACCEPTED") quote.accepted += 1;
      else if (inv.status === "DECLINED") quote.declined += 1;
      else if (inv.status === "SENT" || inv.status === "VIEWED") quote.pending += 1;
    }
  }
  quote.acceptanceRate = quote.sent > 0 ? Math.round((quote.accepted / quote.sent) * 100) : 0;

  const topCustomers = [...customerTotals.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  const topItems = [...itemTotals.entries()].map(([description, total]) => ({ description, total })).sort((a, b) => b.total - a.total).slice(0, 5);

  return { revenueByMonth: buckets, quote, topCustomers, topItems, collected12mo };
}
