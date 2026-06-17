-- Custom domains move from single columns on "websites" to a one-to-many "website_domains" table,
-- so one connection can provision an apex + www pair (and, later, multiple domains per site).
-- IF EXISTS guards keep this safe whether or not the earlier per-column fields were ever applied.
ALTER TABLE "websites" DROP COLUMN IF EXISTS "domain";
ALTER TABLE "websites" DROP COLUMN IF EXISTS "domainStatus";
ALTER TABLE "websites" DROP COLUMN IF EXISTS "domainVerification";
ALTER TABLE "websites" DROP COLUMN IF EXISTS "domainRequestedAt";
ALTER TABLE "websites" DROP COLUMN IF EXISTS "domainError";

-- CreateTable
CREATE TABLE "website_domains" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "verification" JSONB,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_domains_host_key" ON "website_domains"("host");
CREATE INDEX "website_domains_websiteId_idx" ON "website_domains"("websiteId");
CREATE INDEX "website_domains_status_idx" ON "website_domains"("status");

-- AddForeignKey
ALTER TABLE "website_domains" ADD CONSTRAINT "website_domains_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS (deny-all to PostgREST anon/authenticated; Prisma connects as owner + BYPASSRLS).
-- Mirrors 20260614174000_enable_rls_all_tables for this new table.
ALTER TABLE "website_domains" ENABLE ROW LEVEL SECURITY;
