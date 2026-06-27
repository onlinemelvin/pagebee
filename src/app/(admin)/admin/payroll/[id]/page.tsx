import { notFound } from "next/navigation";
import { getPayPeriod, PayrollError } from "@/lib/modules/payroll";
import { PayrollDetail, type PayPeriodData } from "@/components/admin/PayrollDetail";

export const dynamic = "force-dynamic";

export default async function AdminPayrollPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let period;
  try {
    period = await getPayPeriod(id);
  } catch (err) {
    if (err instanceof PayrollError) notFound();
    throw err;
  }

  return <PayrollDetail period={period as PayPeriodData} />;
}
