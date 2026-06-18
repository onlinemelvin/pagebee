-- Vercel-safe generation offload: the long HTML Claude call runs in a Supabase Edge Function
-- (Vercel functions cap at 60s). These columns carry state across the prepare → edge → finalize
-- phases. See src/lib/modules/website/generation-offload.ts.
ALTER TABLE "website_generation_jobs" ADD COLUMN "llmPrompt" JSONB;
ALTER TABLE "website_generation_jobs" ADD COLUMN "llmResult" TEXT;
ALTER TABLE "website_generation_jobs" ADD COLUMN "prepared" JSONB;
