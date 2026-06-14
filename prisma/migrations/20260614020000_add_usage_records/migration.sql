-- Metered usage for resources without a natural source table (AI replies, SMS, email).
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_records_clientId_key_createdAt_idx" ON "usage_records"("clientId", "key", "createdAt");

ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
