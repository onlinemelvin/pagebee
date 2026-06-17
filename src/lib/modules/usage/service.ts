import { prisma } from "@/lib/db";

// Monthly usage metering. Plans include numeric allowances (invoices, AI replies, SMS) stored
// as `*IncludedMonthly` flags; this module resolves the allowance and the current period's usage
// and gates actions at the source. Usage is derived from the source-of-truth table for each key
// (no separate counter to drift). AI-reply and SMS metering register here once those send-paths
// exist — they aren't implemented yet, so those keys are unmetered for now.

export class UsageError extends Error {
  constructor(
    public status: number,
    public code: string,
    public meta?: { key: string; used: number; limit: number },
  ) {
    super(code);
  }
}

/** key → the `featureFlags` allowance entry that meters it. */
const FLAG_FOR: Record<string, string> = {
  invoices: "invoicesIncludedMonthly",
  aiReplies: "aiRepliesIncludedMonthly",
  sms: "smsIncludedMonthly",
  email: "emailIncludedMonthly",
};

async function sumUsage(clientId: string, key: string, since: Date): Promise<number> {
  const r = await prisma.usageRecord.aggregate({
    where: { clientId, key, createdAt: { gte: since } },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}

/** key → a counter over the source-of-truth rows for the current period. */
const COUNTERS: Record<string, (clientId: string, since: Date) => Promise<number>> = {
  // Invoices have a natural source table; AI/SMS/email are tallied from usage_records.
  invoices: (clientId, since) =>
    prisma.invoice.count({ where: { clientId, docType: "INVOICE", createdAt: { gte: since } } }),
  aiReplies: (clientId, since) => sumUsage(clientId, "aiReplies", since),
  sms: (clientId, since) => sumUsage(clientId, "sms", since),
  email: (clientId, since) => sumUsage(clientId, "email", since),
};

/** Record `quantity` units of metered usage for a key (AI replies, SMS, email). */
export async function recordUsage(clientId: string, key: string, quantity = 1): Promise<void> {
  await prisma.usageRecord.create({ data: { clientId, key, quantity } });
}

function monthStart(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

async function planFlags(clientId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { plan: { select: { featureFlags: true } } },
  });
  return (sub?.plan.featureFlags ?? {}) as Record<string, unknown>;
}

/** The monthly allowance for a metered key, or null when this plan doesn't meter it. */
export async function limitFor(clientId: string, key: string): Promise<number | null> {
  const flags = await planFlags(clientId);
  const v = flags[FLAG_FOR[key] ?? ""];
  return typeof v === "number" ? v : null;
}

/** Usage of `key` in the current calendar month (0 when no counter is registered yet). */
export async function getMonthlyUsage(clientId: string, key: string): Promise<number> {
  const counter = COUNTERS[key];
  return counter ? counter(clientId, monthStart()) : 0;
}

/** Throws UsageError(429) when the client has reached this month's allowance for `key`. */
export async function requireWithinLimit(clientId: string, key: string): Promise<void> {
  const limit = await limitFor(clientId, key);
  if (limit === null) return; // not metered on this plan
  const used = await getMonthlyUsage(clientId, key);
  if (used >= limit) throw new UsageError(429, "usage_limit_reached", { key, used, limit });
}

export interface UsageSummary {
  key: string;
  used: number;
  limit: number | null;
}

/** Used + allowance for a key (for the billing dashboard). */
export async function getUsageSummary(clientId: string, key: string): Promise<UsageSummary> {
  const [limit, used] = await Promise.all([limitFor(clientId, key), getMonthlyUsage(clientId, key)]);
  return { key, used, limit };
}
