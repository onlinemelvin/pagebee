-- "Buy a brand new domain" path: PageBee registers a domain through the Vercel registrar on the
-- client's behalf. These columns distinguish bought domains from connected ones, record the price
-- for the admin price-review gate, and remember the client's registrar for connect-path DNS steps.
-- See src/lib/modules/website/domain.ts + src/lib/vercel/registrar.ts.
ALTER TABLE "website_domains" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'connect';
ALTER TABLE "website_domains" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "website_domains" ADD COLUMN "registrar" TEXT;
