-- Public capability token for the unauthenticated rep-shared preview viewer (/p/{token}).
ALTER TABLE "previews" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "previews_publicToken_key" ON "previews"("publicToken");
