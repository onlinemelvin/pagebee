-- Rebrand the three plan tiers: LAUNCH→NECTAR, CONNECT→HONEY, AUTOMATE→HIVE.
-- Renaming enum values rewrites every referencing row in place (Plan.name,
-- Subscription.plan, PreviewOnboarding.selectedPlan, etc.) — no data migration needed.

ALTER TYPE "PlanName" RENAME VALUE 'LAUNCH' TO 'NECTAR';
ALTER TYPE "PlanName" RENAME VALUE 'CONNECT' TO 'HONEY';
ALTER TYPE "PlanName" RENAME VALUE 'AUTOMATE' TO 'HIVE';
