import { listPayPeriods } from "@/lib/modules/payroll";
import { PayrollPeriods, type PayPeriodRow } from "@/components/admin/PayrollPeriods";

export const dynamic = "force-dynamic";

export default async function AdminPayrollPage() {
  const periods = await listPayPeriods();
  const rows: PayPeriodRow[] = periods.map((p) => ({ ...p }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Payroll</h1>
      <p className="mt-1 text-sm text-stone-500">Pay periods for internal staff. Generate, review, approve, and mark paid.</p>
      <div className="mt-6">
        <PayrollPeriods initial={rows} />
      </div>
    </div>
  );
}
