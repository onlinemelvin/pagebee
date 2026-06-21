-- Client → end-customer email stream: audience + customer categories on
-- email_logs, plus per-client Resend sending domains (DKIM). See
-- src/lib/modules/email/ (tenant-* + sending-domains).

-- AlterEnum: customer-facing categories
ALTER TYPE "EmailCategory" ADD VALUE 'CUSTOMER_INQUIRY';
ALTER TYPE "EmailCategory" ADD VALUE 'CUSTOMER_APPOINTMENT';
ALTER TYPE "EmailCategory" ADD VALUE 'CUSTOMER_BILLING';
ALTER TYPE "EmailCategory" ADD VALUE 'CUSTOMER_REVIEW';
ALTER TYPE "EmailCategory" ADD VALUE 'CUSTOMER_MARKETING';

-- CreateEnum
CREATE TYPE "EmailAudience" AS ENUM ('PLATFORM', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SendingDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "email_logs"
    ADD COLUMN "audience" "EmailAudience" NOT NULL DEFAULT 'PLATFORM',
    ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "email_logs_clientId_audience_idx" ON "email_logs"("clientId", "audience");
CREATE INDEX "email_logs_customerId_idx" ON "email_logs"("customerId");

-- CreateTable
CREATE TABLE "sending_domains" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "resendDomainId" TEXT,
    "status" "SendingDomainStatus" NOT NULL DEFAULT 'PENDING',
    "records" JSONB,
    "managedDns" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sending_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sending_domains_domain_key" ON "sending_domains"("domain");
CREATE INDEX "sending_domains_clientId_idx" ON "sending_domains"("clientId");
CREATE INDEX "sending_domains_status_idx" ON "sending_domains"("status");

-- AddForeignKey
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
