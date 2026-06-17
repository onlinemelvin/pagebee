-- Per-image photo gallery membership. Existing rows default to TRUE so currently-live galleries
-- (which today show every image) are preserved after the column is added.
ALTER TABLE "client_media" ADD COLUMN "inGallery" BOOLEAN NOT NULL DEFAULT true;
