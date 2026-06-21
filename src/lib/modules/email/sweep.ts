import { prisma } from "@/lib/db";
import { sendCampaign } from "./bulk";
import * as notify from "./notifications";

/**
 * Send any scheduled campaigns whose time has come. Runs from the background
 * worker; sendCampaign() claims each campaign atomically so overlapping ticks
 * are safe.
 */
export async function sweepScheduledCampaigns(): Promise<{ sent: number }> {
  const due = await prisma.emailCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 25,
  });
  let sent = 0;
  for (const c of due) {
    try {
      await sendCampaign(c.id);
      sent++;
    } catch (err) {
      console.error(`[email:sweep] campaign ${c.id} failed`, err);
    }
  }
  return { sent };
}

const DAY = 86_400_000;

/** True if we already emailed this template to this client within `days`. */
async function recentlySent(clientId: string, template: string, days: number): Promise<boolean> {
  const since = new Date(Date.now() - days * DAY);
  const row = await prisma.emailLog.findFirst({
    where: { clientId, template, createdAt: { gte: since }, status: { not: "FAILED" } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Lifecycle nudges that aren't tied to a single event: remind owners with an
 * unpaid setup fee (and a built preview) to complete checkout. Deduped via the
 * EmailLog so an owner gets at most one nudge every few days.
 */
export async function sweepEmailReminders(): Promise<{ setupReminders: number }> {
  const cutoff = new Date(Date.now() - DAY); // give them 24h before the first nudge
  const pending = await prisma.subscription.findMany({
    where: { status: "SETUP_PENDING", setupFeePaid: false, createdAt: { lte: cutoff } },
    select: { clientId: true, client: { select: { isTest: true, previews: { select: { id: true }, take: 1 } } } },
    take: 100,
  });

  let setupReminders = 0;
  for (const s of pending) {
    if (s.client.isTest || s.client.previews.length === 0) continue;
    if (await recentlySent(s.clientId, "setup_fee_pending", 3)) continue;
    await notify.sendSetupFeePending(s.clientId);
    setupReminders++;
  }
  return { setupReminders };
}
