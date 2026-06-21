// PageBee background generation worker.
//   Local:  npm run worker          (run alongside `npm run dev`, or instead of the inline trigger)
//   Prod:   run as a separate Node process (Railway/Fly/Render/VM) with GENERATION_WORKER=external
//           set on the web app so the API only enqueues. This is the durable, Vercel-safe path —
//           it can spawn the Magic npx subprocess, which serverless/edge cannot.
import fs from "node:fs";

// Load .env (tsx does not auto-load it). Skipped silently in prod where real env vars are set.
try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  /* no .env file — rely on the process environment */
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Import AFTER env is loaded above (the Prisma client reads DATABASE_URL at module load).
  const { claimNextQueuedJob, runGenerationJob, requeueStaleJobs } = await import(
    "@/lib/modules/website"
  );
  const { sweepBookingReminders } = await import("@/lib/modules/booking");
  const { sweepInvoiceReminders, sweepRecurringPlans } = await import("@/lib/modules/finance");
  const { sweepScheduledCampaigns, sweepEmailReminders } = await import("@/lib/modules/email/sweep");
  const { sweepSendingDomains } = await import("@/lib/modules/email/sending-domains");

  console.log("[worker] PageBee generation worker started");
  const recovered = await requeueStaleJobs();
  if (recovered) console.log(`[worker] requeued ${recovered} stale job(s)`);

  let lastReminderSweep = 0;
  const REMINDER_SWEEP_MS = 10 * 60 * 1000;

  for (;;) {
    try {
      // Appointment + invoice payment reminders every ~10 minutes.
      if (Date.now() - lastReminderSweep > REMINDER_SWEEP_MS) {
        lastReminderSweep = Date.now();
        const r = await sweepBookingReminders();
        if (r.sent) console.log(`[worker] booking reminders sent: ${r.sent}`);
        const fr = await sweepInvoiceReminders();
        if (fr.sent) console.log(`[worker] invoice reminders sent: ${fr.sent}`);
        const rp = await sweepRecurringPlans();
        if (rp.generated) console.log(`[worker] recurring invoices generated: ${rp.generated} (auto-charged: ${rp.charged})`);
        const ec = await sweepScheduledCampaigns();
        if (ec.sent) console.log(`[worker] scheduled email campaigns sent: ${ec.sent}`);
        const er = await sweepEmailReminders();
        if (er.setupReminders) console.log(`[worker] setup-fee reminders sent: ${er.setupReminders}`);
        const sd = await sweepSendingDomains();
        if (sd.verified) console.log(`[worker] sending domains verified: ${sd.verified}`);
      }

      const id = await claimNextQueuedJob();
      if (id) {
        console.log(`[worker] processing job ${id}`);
        await runGenerationJob(id);
        console.log(`[worker] finished job ${id}`);
      } else {
        await sleep(3000);
      }
    } catch (err) {
      console.error("[worker] tick error:", err);
      await sleep(5000);
    }
  }
}

main();
