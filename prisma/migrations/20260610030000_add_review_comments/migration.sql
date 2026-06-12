-- CreateEnum
CREATE TYPE "ReviewActorType" AS ENUM ('ADMIN', 'REVIEWER', 'CLIENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReviewCommentKind" AS ENUM ('CHANGE_REQUEST', 'NOTE');

-- CreateEnum
CREATE TYPE "ReviewCommentStatus" AS ENUM ('OPEN', 'RESOLVED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "website_review_comments" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "parent_id" TEXT,
    "authorType" "ReviewActorType" NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" "ReviewCommentKind" NOT NULL DEFAULT 'CHANGE_REQUEST',
    "status" "ReviewCommentStatus" NOT NULL DEFAULT 'OPEN',
    "pagePath" TEXT NOT NULL DEFAULT '/',
    "selector" TEXT,
    "anchorText" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "body" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_review_comments_versionId_idx" ON "website_review_comments"("versionId");

-- CreateIndex
CREATE INDEX "website_review_comments_versionId_status_idx" ON "website_review_comments"("versionId", "status");

-- CreateIndex
CREATE INDEX "website_review_comments_parent_id_idx" ON "website_review_comments"("parent_id");

-- AddForeignKey
ALTER TABLE "website_review_comments" ADD CONSTRAINT "website_review_comments_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "website_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_review_comments" ADD CONSTRAINT "website_review_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "website_review_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

