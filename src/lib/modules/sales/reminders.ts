import { prisma } from "@/lib/db";
import { sendEmail, escapeHtml } from "@/lib/modules/email";

/**
 * Email reps about follow-ups that have come due. Runs from the cron sweep. Fires exactly once per
 * follow-up (gated on `remindedAt`), fail-soft per row. Reps aren't tenants, so the in-app bell
 * (tenant-scoped) doesn't apply — email is the rep reminder channel. The portal's follow-ups page +
 * dashboard badge cover the in-app view.
 */
export async function sweepFollowUpReminders(now: Date = new Date()) {
  const due = await prisma.followUp.findMany({
    where: { completed: false, remindedAt: null, dueAt: { lte: now } },
    include: { prospect: { select: { businessName: true } } },
    take: 200,
  });
  if (due.length === 0) return { processed: 0, emailed: 0 };

  const repIds = [...new Set(due.map((f) => f.assignedToId).filter((v): v is string => Boolean(v)))];
  const reps = await prisma.employee.findMany({
    where: { id: { in: repIds } },
    select: { id: true, user: { select: { email: true } } },
  });
  const emailByRep = new Map(reps.map((r) => [r.id, r.user?.email ?? null]));

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const link = base ? `<p><a href="${base}/rep/follow-ups">Open your follow-ups →</a></p>` : "";

  let emailed = 0;
  for (const f of due) {
    const email = f.assignedToId ? emailByRep.get(f.assignedToId) : null;
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: `Follow-up due: ${f.prospect.businessName}`,
          html:
            `<p>A follow-up is due for <strong>${escapeHtml(f.prospect.businessName)}</strong>.</p>` +
            (f.note ? `<p>${escapeHtml(f.note)}</p>` : "") +
            link,
        });
        emailed++;
      } catch (err) {
        console.error("[reminders] follow-up email failed", err);
      }
    }
    // Mark reminded regardless (fire-once), so a missing rep email doesn't loop forever.
    await prisma.followUp.update({ where: { id: f.id }, data: { remindedAt: now } });
  }
  return { processed: due.length, emailed };
}
