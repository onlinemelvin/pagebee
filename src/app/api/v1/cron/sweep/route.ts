import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Give the batch room on Pro (Hobby caps lower). Each sweep is bounded, but several run in sequence.
export const maxDuration = 60;

/**
 * GET /api/v1/cron/sweep — the periodic (~10-min) maintenance batch, replacing the long-running
 * worker's sweep loop so it runs serverlessly on Vercel Cron: appointment + invoice reminders,
 * recurring invoices, scheduled email campaigns, setup-fee reminders, and sending-domain verification.
 * (The chat escalation sweep has its own 1-minute cron; website generation stays on its own path.)
 *
 * Each step is isolated so one failure can't abort the rest. Auth mirrors the other cron routes:
 * CRON_SECRET (or INTERNAL_API_SECRET), fail-closed.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ sweepBookingReminders }, { sweepInvoiceReminders, sweepRecurringPlans }, { sweepScheduledCampaigns, sweepEmailReminders }, { sweepSendingDomains }, { runCommissionAccrualSweep, runCommissionEligibilitySweep, sweepFollowUpReminders }] = await Promise.all([
    import("@/lib/modules/booking"),
    import("@/lib/modules/finance"),
    import("@/lib/modules/email/sweep"),
    import("@/lib/modules/email/sending-domains"),
    import("@/lib/modules/sales"),
  ]);

  const results: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      results[name] = await fn();
    } catch (err) {
      console.error(`[cron/sweep] ${name} failed`, err);
      results[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  };

  await run("bookingReminders", () => sweepBookingReminders());
  await run("invoiceReminders", () => sweepInvoiceReminders());
  await run("recurringPlans", () => sweepRecurringPlans());
  await run("scheduledCampaigns", () => sweepScheduledCampaigns());
  await run("emailReminders", () => sweepEmailReminders());
  await run("sendingDomains", () => sweepSendingDomains());
  await run("commissionAccrual", () => runCommissionAccrualSweep());
  await run("commissionEligibility", () => runCommissionEligibilitySweep(new Date()));
  await run("followUpReminders", () => sweepFollowUpReminders());

  return NextResponse.json({ ok: true, ...results });
}
