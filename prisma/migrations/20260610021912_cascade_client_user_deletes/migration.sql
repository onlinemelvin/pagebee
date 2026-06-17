-- DropForeignKey
ALTER TABLE "account_balances" DROP CONSTRAINT "account_balances_clientId_fkey";

-- DropForeignKey
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_userId_fkey";

-- DropForeignKey
ALTER TABLE "dues" DROP CONSTRAINT "dues_clientId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_clientId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_clientId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "statements" DROP CONSTRAINT "statements_clientId_fkey";

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previews" ADD CONSTRAINT "previews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues" ADD CONSTRAINT "dues_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
