-- Sales-rep program (Phase 1 of internal ops). See docs/SALES_REP_PROGRAM.md.

-- 1. CommissionPlan: rename stale plan-name columns to Nectar/Honey/Hive + new defaults.
ALTER TABLE "commission_plans" RENAME COLUMN "launchBase" TO "nectarBase";
ALTER TABLE "commission_plans" RENAME COLUMN "connectBase" TO "honeyBase";
ALTER TABLE "commission_plans" RENAME COLUMN "automateBase" TO "hiveBase";
ALTER TABLE "commission_plans" ALTER COLUMN "nectarBase" SET DEFAULT 60;
ALTER TABLE "commission_plans" ALTER COLUMN "honeyBase" SET DEFAULT 110;
ALTER TABLE "commission_plans" ALTER COLUMN "hiveBase" SET DEFAULT 185;

-- 2. Employee: certification gate (reps can't quote until certified).
ALTER TABLE "employees" ADD COLUMN "certifiedAt" TIMESTAMP(3);

-- 3. Prospect: dedup fingerprint for first-touch assignment lock (anti lead-stealing).
ALTER TABLE "prospects" ADD COLUMN "dedupeKey" TEXT;
CREATE INDEX "prospects_dedupeKey_idx" ON "prospects"("dedupeKey");
