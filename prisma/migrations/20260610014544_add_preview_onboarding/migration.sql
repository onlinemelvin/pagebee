-- CreateEnum
CREATE TYPE "PreviewStatus" AS ENUM ('INTAKE_STARTED', 'INTAKE_COMPLETED', 'PREVIEW_GENERATING', 'PREVIEW_READY', 'PREVIEW_SENT', 'PREVIEW_VIEWED', 'REVISION_REQUESTED', 'REVISION_COMPLETED', 'APPROVED', 'SETUP_FEE_PENDING', 'SETUP_FEE_PAID', 'LAUNCH_IN_PROGRESS', 'LIVE', 'EXPIRED', 'LOST');

-- CreateTable
CREATE TABLE "previews" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "websiteId" TEXT,
    "selectedPlan" "PlanName" NOT NULL,
    "status" "PreviewStatus" NOT NULL DEFAULT 'INTAKE_STARTED',
    "previewUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "maxFreeRevisions" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "assignedSalesRepId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_revisions" (
    "id" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "requestText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preview_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversions" (
    "id" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT NOT NULL,
    "selectedPlan" "PlanName" NOT NULL,
    "setupFeeAmount" INTEGER NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "setupFeePaidAt" TIMESTAMP(3),
    "subscriptionStartedAt" TIMESTAMP(3),
    "convertedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "previews_websiteId_key" ON "previews"("websiteId");

-- CreateIndex
CREATE INDEX "previews_status_idx" ON "previews"("status");

-- CreateIndex
CREATE INDEX "previews_prospectId_idx" ON "previews"("prospectId");

-- CreateIndex
CREATE INDEX "previews_clientId_idx" ON "previews"("clientId");

-- CreateIndex
CREATE INDEX "previews_assignedSalesRepId_idx" ON "previews"("assignedSalesRepId");

-- CreateIndex
CREATE INDEX "preview_revisions_previewId_idx" ON "preview_revisions"("previewId");

-- CreateIndex
CREATE UNIQUE INDEX "conversions_previewId_key" ON "conversions"("previewId");

-- CreateIndex
CREATE INDEX "conversions_clientId_idx" ON "conversions"("clientId");

-- CreateIndex
CREATE INDEX "conversions_prospectId_idx" ON "conversions"("prospectId");

-- AddForeignKey
ALTER TABLE "preview_revisions" ADD CONSTRAINT "preview_revisions_previewId_fkey" FOREIGN KEY ("previewId") REFERENCES "previews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_previewId_fkey" FOREIGN KEY ("previewId") REFERENCES "previews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
