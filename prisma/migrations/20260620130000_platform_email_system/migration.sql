-- Platform → client email system: categories, campaigns, templates, marketing
-- suppression list, branded auth tokens, and full provider-webhook tracking on
-- email_logs. See src/lib/modules/email/.

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('WELCOME', 'AUTH', 'BILLING', 'WEBSITE', 'USAGE', 'ACCOUNT', 'TIPS', 'ANNOUNCEMENT', 'PROMOTION');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- AlterTable: extend email_logs with category, recipient, campaign link, and tracking timestamps
ALTER TABLE "email_logs"
    ADD COLUMN "recipientUserId" TEXT,
    ADD COLUMN "category" "EmailCategory" NOT NULL DEFAULT 'ACCOUNT',
    ADD COLUMN "campaignId" TEXT,
    ADD COLUMN "sentAt" TIMESTAMP(3),
    ADD COLUMN "deliveredAt" TIMESTAMP(3),
    ADD COLUMN "openedAt" TIMESTAMP(3),
    ADD COLUMN "clickedAt" TIMESTAMP(3),
    ADD COLUMN "bouncedAt" TIMESTAMP(3),
    ADD COLUMN "complainedAt" TIMESTAMP(3),
    ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "category" "EmailCategory" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "segment" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "category" "EmailCategory" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_unsubscribes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "clientId" TEXT,
    "category" "EmailCategory",
    "reason" TEXT NOT NULL DEFAULT 'user',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_category_idx" ON "email_logs"("category");
CREATE INDEX "email_logs_campaignId_idx" ON "email_logs"("campaignId");
CREATE INDEX "email_logs_providerId_idx" ON "email_logs"("providerId");
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");
CREATE INDEX "email_campaigns_scheduledAt_idx" ON "email_campaigns"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "email_unsubscribes_token_key" ON "email_unsubscribes"("token");
CREATE INDEX "email_unsubscribes_email_idx" ON "email_unsubscribes"("email");
CREATE INDEX "email_unsubscribes_clientId_idx" ON "email_unsubscribes"("clientId");
CREATE UNIQUE INDEX "email_unsubscribes_email_category_key" ON "email_unsubscribes"("email", "category");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX "auth_tokens_userId_idx" ON "auth_tokens"("userId");
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
