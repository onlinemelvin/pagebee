import { prisma } from "@/lib/db";
import * as customerNotify from "@/lib/modules/email/customer-notifications";
import { getFinanceSettings } from "./service";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Worker sweep: email payment reminders for open invoices on each owner's configured schedule
 * (`reminders.beforeDueDays` / `afterDueDays`), at most one per invoice per day. Also flips past-due
 * invoices to OVERDUE. No-op for owners who haven't enabled reminders. Safe to run every few minutes.
 */
export async function sweepInvoiceReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const today = utcDay(now);
  const invoices = await prisma.invoice.findMany({
    where: {
      docType: "INVOICE",
      kind: "CLIENT_CUSTOMER",
      status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
      dueDate: { not: null },
      publicToken: { not: null },
    },
    include: { customer: { select: { name: true, email: true } } },
    take: 2000,
  });

  const settingsCache = new Map<string, Awaited<ReturnType<typeof getFinanceSettings>>>();
  let sent = 0;

  for (const inv of invoices) {
    const balance = inv.total - inv.amountPaid;
    if (balance <= 0 || !inv.customer?.email || !inv.dueDate) continue;

    const dueDay = utcDay(inv.dueDate);
    const daysPastDue = Math.round((today - dueDay) / DAY); // >0 overdue, <0 before due

    // Keep status accurate even if no reminder is due today.
    if (daysPastDue > 0 && inv.status !== "OVERDUE") {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    }

    // At most one reminder per calendar day.
    if (inv.lastReminderAt && utcDay(inv.lastReminderAt) === today) continue;

    let settings = settingsCache.get(inv.clientId);
    if (!settings) {
      settings = await getFinanceSettings(inv.clientId);
      settingsCache.set(inv.clientId, settings);
    }
    const rem = settings.reminders;
    if (!rem?.enabled) continue;

    const dueToday =
      (daysPastDue < 0 && rem.beforeDueDays.includes(-daysPastDue)) ||
      (daysPastDue > 0 && rem.afterDueDays.includes(daysPastDue));
    if (!dueToday) continue;

    await customerNotify.sendInvoiceOverdue(inv.clientId, {
      to: inv.customer.email,
      customerId: inv.customerId,
      customerName: inv.customer.name,
      number: inv.number,
      amountCents: balance,
      currency: inv.currency,
      dueOn: inv.dueDate.toLocaleDateString("en-US", { dateStyle: "long" }),
      viewUrl: `${APP_URL}/d/${inv.publicToken}`,
    });
    await prisma.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: now, reminderCount: { increment: 1 } } });
    sent++;
  }

  return { sent };
}

/** Count completed appointments that haven't been invoiced yet — surfaced as a dashboard nudge. */
export async function pastUninvoicedAppointments(clientId: string): Promise<number> {
  return prisma.booking.count({
    where: { clientId, status: "COMPLETED", invoices: { none: {} }, depositInvoiceId: null },
  });
}
