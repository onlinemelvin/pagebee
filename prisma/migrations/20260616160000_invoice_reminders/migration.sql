-- Payment-reminder bookkeeping so the worker sends at most one reminder per day per invoice,
-- following the owner's configured before/after-due schedule.
ALTER TABLE "invoices" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
