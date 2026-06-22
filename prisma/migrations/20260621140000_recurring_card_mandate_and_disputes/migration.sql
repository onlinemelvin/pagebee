-- White-label card-on-file authorization for AUTO_CHARGE recurring plans + dispute tracking.

-- New PaymentStatus value for chargebacks.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

-- RecurringPlan: public authorization token + card-on-file mandate evidence.
ALTER TABLE "recurring_plans"
  ADD COLUMN "authToken" TEXT,
  ADD COLUMN "mandateAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "mandateText" TEXT,
  ADD COLUMN "mandateIp" TEXT;

CREATE UNIQUE INDEX "recurring_plans_authToken_key" ON "recurring_plans"("authToken");
