-- Follow-up reminder cron: one-shot reminder per follow-up.
ALTER TABLE "follow_ups" ADD COLUMN "remindedAt" TIMESTAMP(3);
