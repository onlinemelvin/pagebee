-- The appointment booking trigger section, stripped from the generated page and stored separately
-- (mirrors leadFormHtml). Injected back at serve time only when the plan allows booking and the
-- owner enabled it; the platform-owned booking modal is added at serve time. See src/lib/site/booking.ts.
ALTER TABLE "website_versions" ADD COLUMN "bookingHtml" TEXT;
