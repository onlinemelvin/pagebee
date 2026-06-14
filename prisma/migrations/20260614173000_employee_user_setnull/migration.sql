-- Deleting a Supabase auth user (via the on_auth_user_deleted trigger) deletes the app user.
-- If that user is an Employee, employees_userId_fkey (RESTRICT) blocked it. Detach instead:
-- keep the employee + their payroll/commission/quote/sales history, just null the login link.
ALTER TABLE "employees" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "employees" DROP CONSTRAINT "employees_userId_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
