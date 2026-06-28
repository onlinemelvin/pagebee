-- A prospect can now hold several provisional preview clients at once (one per showcase plan),
-- so Client.prospectId is no longer unique. Replace the unique index with a plain index.
DROP INDEX "clients_prospectId_key";
CREATE INDEX "clients_prospectId_idx" ON "clients"("prospectId");

-- Rep-set concession: percentage off the one-time setup fee for a preview (0–100). The monthly
-- fee is never discounted. Carried onto the subscription when the prospect adopts the preview.
-- `setupDiscountPct` is the in-force discount; `pendingDiscountPct` is one awaiting admin approval.
ALTER TABLE "previews" ADD COLUMN "setupDiscountPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "previews" ADD COLUMN "pendingDiscountPct" INTEGER;

-- A rep-requested setup discount that exceeds rep authority (setup below the plan floor / waived)
-- and needs admin sign-off before it applies. Mirrors quote_approvals.
CREATE TABLE "preview_discount_approvals" (
    "id" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedPct" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decisionAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_discount_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "preview_discount_approvals_previewId_idx" ON "preview_discount_approvals"("previewId");
CREATE INDEX "preview_discount_approvals_status_idx" ON "preview_discount_approvals"("status");

ALTER TABLE "preview_discount_approvals" ADD CONSTRAINT "preview_discount_approvals_previewId_fkey" FOREIGN KEY ("previewId") REFERENCES "previews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
