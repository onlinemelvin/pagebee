-- Recurring service plans: repeat billing for things like lawn care, cleaning, retainers.
CREATE TYPE "RecurringInterval" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "RecurringMode" AS ENUM ('INVOICE', 'AUTO_CHARGE');
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

CREATE TABLE "recurring_plans" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mode" "RecurringMode" NOT NULL DEFAULT 'INVOICE',
  "interval" "RecurringInterval" NOT NULL DEFAULT 'MONTHLY',
  "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
  "lineItems" JSONB NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "notes" TEXT,
  "dueDays" INTEGER NOT NULL DEFAULT 14,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "occurrences" INTEGER NOT NULL DEFAULT 0,
  "stripeCustomerId" TEXT,
  "stripePaymentMethodId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurring_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_plans_clientId_idx" ON "recurring_plans"("clientId");
CREATE INDEX "recurring_plans_status_nextRunAt_idx" ON "recurring_plans"("status", "nextRunAt");
CREATE INDEX "recurring_plans_customerId_idx" ON "recurring_plans"("customerId");

ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD COLUMN "recurringPlanId" TEXT;
CREATE INDEX "invoices_recurringPlanId_idx" ON "invoices"("recurringPlanId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurringPlanId_fkey" FOREIGN KEY ("recurringPlanId") REFERENCES "recurring_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
