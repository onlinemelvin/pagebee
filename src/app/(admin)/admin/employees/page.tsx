import { listEmployees } from "@/lib/modules/payroll";
import { EmployeeRoster, type EmployeeRowData } from "@/components/admin/EmployeeRoster";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const employees = await listEmployees();
  const rows: EmployeeRowData[] = employees.map((e) => ({ ...e }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Employees</h1>
      <p className="mt-1 text-sm text-stone-500">Internal salaried, hourly, and support staff (commission reps live under Reps).</p>
      <div className="mt-6">
        <EmployeeRoster initial={rows} />
      </div>
    </div>
  );
}
