-- Promotional monthly discount (first-year promo) on a preview, gated through the same admin
-- approval as a below-floor setup discount. `monthlyDiscountPct` is the in-force value;
-- `pendingMonthlyPct` is one awaiting sign-off.
ALTER TABLE "previews" ADD COLUMN "monthlyDiscountPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "previews" ADD COLUMN "pendingMonthlyPct" INTEGER;

-- The approval request now carries the monthly promo % alongside the setup %.
ALTER TABLE "preview_discount_approvals" ADD COLUMN "requestedMonthlyPct" INTEGER NOT NULL DEFAULT 0;

-- Time-boxed promotional monthly rate recorded on the subscription at signup: pay `promoMonthlyFee`
-- for `promoMonths` cycles, then revert to `agreedMonthlyFee`.
ALTER TABLE "subscriptions" ADD COLUMN "promoMonthlyFee" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "promoMonths" INTEGER;
