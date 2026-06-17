-- CRM fields on the customer record so a tenant can keep a real contact list (manual + auto from
-- the lead form) that any small business can use: company/fleet account, quick tags, a free-text
-- note, trade-specific custom fields, acquisition source, and soft-archive.
ALTER TABLE "customers" ADD COLUMN "company" TEXT;
ALTER TABLE "customers" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "customers" ADD COLUMN "notes" TEXT;
ALTER TABLE "customers" ADD COLUMN "customFields" JSONB;
ALTER TABLE "customers" ADD COLUMN "source" TEXT;
ALTER TABLE "customers" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "customers_clientId_archivedAt_idx" ON "customers"("clientId", "archivedAt");
