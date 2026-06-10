import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/modules/email";

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 14);
// Send the "card reminder" when this many days remain (~day 12 of a 14-day trial).
const REMIND_DAYS_BEFORE = Number(process.env.TRIAL_REMIND_DAYS ?? 2);

export function trialDaysLeft(trialEndsAt: Date | null | undefined): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000));
}

async function alreadyNotified(clientId: string, event: string): Promise<boolean> {
  return (await prisma.notificationEvent.count({ where: { clientId, event } })) > 0;
}
async function recordNotice(clientId: string, event: string) {
  await prisma.notificationEvent.create({ data: { clientId, event, channel: "EMAIL" } });
}

/**
 * Periodic trial lifecycle sweep (idempotent — safe to run on every worker tick):
 *  - ~day 12: email a reminder to add a card.
 *  - day 14: pause the subscription and take the website down until paid.
 * The actual card capture / charge is wired in the Stripe phase.
 */
export async function sweepTrials(): Promise<{ reminded: number; suspended: number }> {
  const now = Date.now();
  const trials = await prisma.subscription.findMany({ where: { status: "TRIAL" }, include: { client: true } });

  let reminded = 0;
  let suspended = 0;

  for (const sub of trials) {
    if (!sub.trialEndsAt) continue;
    const owner = sub.client.ownerEmail;
    const msLeft = sub.trialEndsAt.getTime() - now;

    if (msLeft <= 0) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "SUSPENDED" } });
      await prisma.website.updateMany({
        where: { clientId: sub.clientId, status: "published" },
        data: { status: "suspended" },
      });
      if (owner && !(await alreadyNotified(sub.clientId, "trial.ended"))) {
        await sendEmail({
          to: owner,
          subject: "Your PageBee trial has ended",
          html: `<p>Your 14-day trial has ended and your site is paused. Add a card to bring ${sub.client.businessName} back online — your content is saved.</p>`,
        });
        await recordNotice(sub.clientId, "trial.ended");
      }
      suspended++;
    } else {
      const daysLeft = Math.ceil(msLeft / 86_400_000);
      if (owner && daysLeft <= REMIND_DAYS_BEFORE && !(await alreadyNotified(sub.clientId, "trial.reminder"))) {
        await sendEmail({
          to: owner,
          subject: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your PageBee trial`,
          html: `<p>Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Add a card so ${sub.client.businessName} and your inquiries keep running without interruption — or skip and decide later.</p>`,
        });
        await recordNotice(sub.clientId, "trial.reminder");
        reminded++;
      }
    }
  }
  return { reminded, suspended };
}
