-- EVALUATION (temporary): store the exact LLM prompt(s) used for each generated draft so admins
-- can verify generation quality. Safe to drop later (DROP COLUMN "promptLog").
-- AlterTable
ALTER TABLE "website_generation_jobs" ADD COLUMN     "promptLog" JSONB;
