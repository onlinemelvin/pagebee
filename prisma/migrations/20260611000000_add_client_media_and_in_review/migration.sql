-- AlterEnum: new preview state for drafts awaiting platform review before the client sees them
ALTER TYPE "PreviewStatus" ADD VALUE 'IN_REVIEW' BEFORE 'PREVIEW_READY';

-- CreateTable: account-level reusable media library
CREATE TABLE "client_media" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "alt" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_media_clientId_idx" ON "client_media"("clientId");

-- AddForeignKey
ALTER TABLE "client_media" ADD CONSTRAINT "client_media_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
