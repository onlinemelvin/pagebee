-- Deleting a client cascades to its previews; a conversion belongs to that preview and
-- must go with it. Previously conversions_previewId_fkey was RESTRICT, which blocked
-- client (and Supabase auth-user) deletion with "update or delete on previews violates
-- foreign key constraint conversions_previewId_fkey".
ALTER TABLE "conversions" DROP CONSTRAINT "conversions_previewId_fkey";
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_previewId_fkey"
  FOREIGN KEY ("previewId") REFERENCES "previews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
