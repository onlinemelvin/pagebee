-- AlterTable: structured billing address for Stripe Tax
ALTER TABLE "customers" ADD COLUMN "billingAddress" JSONB;

-- AlterTable: Stripe Tax calculation reference (to file the transaction on payment)
ALTER TABLE "invoices" ADD COLUMN "taxCalculationId" TEXT;
