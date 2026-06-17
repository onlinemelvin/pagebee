import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma, RecurringInterval, RecurringMode, RecurringStatus } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { chargeInvoiceOffSession } from "@/lib/modules/payments";
import { createDocument, sendDocument, FinanceError } from "./service";

const recurringLineSchema = z.object({
  serviceId: z.string().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(100000).default(1),
  unitAmount: z.number().int().min(0).max(100_000_000),
  taxRateId: z.string().nullable().optional(),
});

export const recurringPlanSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  mode: z.enum(["INVOICE", "AUTO_CHARGE"]).default("INVOICE"),
  interval: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  lineItems: z.array(recurringLineSchema).min(1),
  currency: z.string().min(3).max(8).default("usd"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  dueDays: z.number().int().min(0).max(120).default(14),
  startDate: z.string().optional(), // ISO date for the first run (defaults to today)
});
export type RecurringPlanInput = z.infer<typeof recurringPlanSchema>;

export const recurringUpdateSchema = recurringPlanSchema.partial().extend({
  status: z.enum(["ACTIVE", "PAUSED", "ENDED"]).optional(),
});

export interface RecurringLine {
  serviceId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  taxRateId: string | null;
}

export interface RecurringPlanDTO {
  id: string;
  customerId: string;
  customerName: string | null;
  title: string;
  mode: RecurringMode;
  interval: RecurringInterval;
  status: RecurringStatus;
  lineItems: RecurringLine[];
  currency: string;
  notes: string | null;
  dueDays: number;
  nextRunAt: string;
  lastRunAt: string | null;
  occurrences: number;
  amountPerCycle: number;
  hasCardOnFile: boolean;
  createdAt: string;
}

const INTERVAL_LABEL: Record<RecurringInterval, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Every 3 months",
  YEARLY: "Yearly",
};
export function intervalLabel(i: RecurringInterval): string {
  return INTERVAL_LABEL[i];
}

/** Advance a date by one interval (calendar-aware for month/quarter/year). */
function addInterval(from: Date, interval: RecurringInterval): Date {
  const d = new Date(from);
  switch (interval) {
    case "WEEKLY": d.setUTCDate(d.getUTCDate() + 7); break;
    case "BIWEEKLY": d.setUTCDate(d.getUTCDate() + 14); break;
    case "MONTHLY": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "QUARTERLY": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "YEARLY": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d;
}

function parseLines(value: Prisma.JsonValue | null): RecurringLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((l) => {
    const r = (l ?? {}) as Record<string, unknown>;
    return {
      serviceId: (r.serviceId as string) ?? null,
      description: String(r.description ?? ""),
      quantity: Number(r.quantity ?? 1),
      unitAmount: Number(r.unitAmount ?? 0),
      taxRateId: (r.taxRateId as string) ?? null,
    };
  });
}

type PlanRow = Prisma.RecurringPlanGetPayload<{ include: { customer: { select: { name: true } } } }>;
function toDTO(p: PlanRow): RecurringPlanDTO {
  const lines = parseLines(p.lineItems);
  return {
    id: p.id,
    customerId: p.customerId,
    customerName: p.customer?.name ?? null,
    title: p.title,
    mode: p.mode,
    interval: p.interval,
    status: p.status,
    lineItems: lines,
    currency: p.currency,
    notes: p.notes,
    dueDays: p.dueDays,
    nextRunAt: p.nextRunAt.toISOString(),
    lastRunAt: p.lastRunAt?.toISOString() ?? null,
    occurrences: p.occurrences,
    amountPerCycle: lines.reduce((sum, l) => sum + l.quantity * l.unitAmount, 0),
    hasCardOnFile: Boolean(p.stripeCustomerId && p.stripePaymentMethodId),
    createdAt: p.createdAt.toISOString(),
  };
}

const INCLUDE = { customer: { select: { name: true } } } as const;

export async function listRecurringPlans(clientId: string): Promise<RecurringPlanDTO[]> {
  const rows = await prisma.recurringPlan.findMany({ where: { clientId }, orderBy: [{ status: "asc" }, { nextRunAt: "asc" }], include: INCLUDE });
  return rows.map(toDTO);
}

export async function createRecurringPlan(clientId: string, input: unknown): Promise<RecurringPlanDTO> {
  const data = recurringPlanSchema.parse(input);
  const owns = await prisma.customer.findFirst({ where: { id: data.customerId, clientId }, select: { id: true } });
  if (!owns) throw new FinanceError(404, "customer_not_found");
  const start = data.startDate ? new Date(data.startDate) : new Date();
  const plan = await prisma.recurringPlan.create({
    data: {
      clientId,
      customerId: data.customerId,
      title: data.title,
      mode: data.mode,
      interval: data.interval,
      lineItems: data.lineItems as unknown as Prisma.InputJsonValue,
      currency: data.currency,
      notes: data.notes || null,
      dueDays: data.dueDays,
      nextRunAt: start,
    },
    include: INCLUDE,
  });
  await writeAudit({ action: "finance.recurring_created", entityType: "RecurringPlan", entityId: plan.id, clientId });
  return toDTO(plan);
}

export async function updateRecurringPlan(clientId: string, id: string, input: unknown): Promise<RecurringPlanDTO> {
  const owns = await prisma.recurringPlan.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!owns) throw new FinanceError(404, "not_found");
  const data = recurringUpdateSchema.parse(input);
  const patch: Prisma.RecurringPlanUpdateInput = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.mode !== undefined) patch.mode = data.mode;
  if (data.interval !== undefined) patch.interval = data.interval;
  if (data.status !== undefined) patch.status = data.status;
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.notes !== undefined) patch.notes = data.notes || null;
  if (data.dueDays !== undefined) patch.dueDays = data.dueDays;
  if (data.lineItems !== undefined) patch.lineItems = data.lineItems as unknown as Prisma.InputJsonValue;
  if (data.startDate) patch.nextRunAt = new Date(data.startDate);
  const plan = await prisma.recurringPlan.update({ where: { id }, data: patch, include: INCLUDE });
  await writeAudit({ action: "finance.recurring_updated", entityType: "RecurringPlan", entityId: id, clientId });
  return toDTO(plan);
}

export async function deleteRecurringPlan(clientId: string, id: string): Promise<{ id: string }> {
  const owns = await prisma.recurringPlan.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!owns) throw new FinanceError(404, "not_found");
  // Keep historical invoices (their recurringPlanId is set null on delete via the FK).
  await prisma.recurringPlan.delete({ where: { id } });
  await writeAudit({ action: "finance.recurring_deleted", entityType: "RecurringPlan", entityId: id, clientId });
  return { id };
}

/**
 * Worker sweep: for every ACTIVE plan whose nextRunAt has arrived, generate an invoice from its
 * template and send it (email + pay link). AUTO_CHARGE plans with a saved card additionally attempt
 * an off-session charge; if that can't run (no card yet / Stripe not live) the sent pay link stands.
 * Advances the schedule by one interval. Safe to run frequently.
 */
export async function sweepRecurringPlans(): Promise<{ generated: number; charged: number }> {
  const now = new Date();
  const due = await prisma.recurringPlan.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, take: 500 });
  let generated = 0;
  let charged = 0;

  for (const plan of due) {
    try {
      const lines = parseLines(plan.lineItems);
      if (lines.length === 0) continue;
      const doc = await createDocument(plan.clientId, {
        docType: "INVOICE",
        customerId: plan.customerId,
        currency: plan.currency,
        lineItems: lines.map((l) => ({ serviceId: l.serviceId, description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, discountType: null, discountValue: 0, taxRateId: l.taxRateId })),
        dueDate: new Date(now.getTime() + plan.dueDays * 86_400_000).toISOString(),
      });
      await prisma.invoice.update({ where: { id: doc.id }, data: { recurringPlanId: plan.id } });
      // Send (emails the customer + mints the public pay link).
      await sendDocument(plan.clientId, doc.id);
      generated++;

      if (plan.mode === "AUTO_CHARGE" && plan.stripeCustomerId && plan.stripePaymentMethodId) {
        const res = await chargeInvoiceOffSession(doc.id, { stripeCustomerId: plan.stripeCustomerId, paymentMethodId: plan.stripePaymentMethodId });
        if (res.charged) charged++;
      }

      await prisma.recurringPlan.update({
        where: { id: plan.id },
        data: { lastRunAt: now, nextRunAt: addInterval(plan.nextRunAt > now ? plan.nextRunAt : now, plan.interval), occurrences: { increment: 1 } },
      });
    } catch (err) {
      console.error(`[recurring] plan ${plan.id} failed`, err);
      // Don't let one bad plan stall the sweep; push its next run out a day so it retries later.
      await prisma.recurringPlan.update({ where: { id: plan.id }, data: { nextRunAt: new Date(now.getTime() + 86_400_000) } }).catch(() => {});
    }
  }
  return { generated, charged };
}
