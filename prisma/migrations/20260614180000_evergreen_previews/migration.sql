-- Evergreen previews: previews no longer expire. Drop the expiry column and remove the now-unused
-- EXPIRED state from PreviewStatus. Postgres has no "DROP VALUE", so the enum is recreated.

-- DropColumn
ALTER TABLE "previews" DROP COLUMN "expiresAt";

-- AlterEnum: rebuild PreviewStatus without EXPIRED
ALTER TYPE "PreviewStatus" RENAME TO "PreviewStatus_old";

CREATE TYPE "PreviewStatus" AS ENUM (
    'INTAKE_STARTED',
    'INTAKE_COMPLETED',
    'PREVIEW_GENERATING',
    'IN_REVIEW',
    'PREVIEW_READY',
    'PREVIEW_SENT',
    'PREVIEW_VIEWED',
    'REVISION_REQUESTED',
    'REVISION_COMPLETED',
    'APPROVED',
    'SETUP_FEE_PENDING',
    'SETUP_FEE_PAID',
    'LAUNCH_IN_PROGRESS',
    'LIVE',
    'LOST'
);

-- Any previously-expired previews collapse to LOST (closest surviving terminal state).
ALTER TABLE "previews" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "previews" SET "status" = 'LOST' WHERE "status" = 'EXPIRED';
ALTER TABLE "previews"
    ALTER COLUMN "status" TYPE "PreviewStatus" USING ("status"::text::"PreviewStatus");
ALTER TABLE "previews" ALTER COLUMN "status" SET DEFAULT 'INTAKE_STARTED';

DROP TYPE "PreviewStatus_old";
