-- CreateTable
CREATE TABLE "website_updates" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "versionId" TEXT,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upgrade_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromPlan" TEXT NOT NULL,
    "toPlan" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "appliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_updates_clientId_createdAt_idx" ON "website_updates"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "upgrade_requests_status_idx" ON "upgrade_requests"("status");

-- AddForeignKey
ALTER TABLE "website_updates" ADD CONSTRAINT "website_updates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
