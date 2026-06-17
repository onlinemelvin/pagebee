-- General appointment ↔ invoice link (separate from the 1:1 deposit relation) so an appointment can
-- show whether it has been invoiced and whether that invoice was sent/paid.
ALTER TABLE "invoices" ADD COLUMN "bookingId" TEXT;
CREATE INDEX "invoices_bookingId_idx" ON "invoices"("bookingId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
