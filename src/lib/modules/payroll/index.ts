// Public surface of the payroll module (internal HR — employees + pay periods). Phase 4 of ops.
export { PayrollError } from "./errors";
export { listEmployees, createEmployee, updateEmployee } from "./employees";
export type { EmployeeRow } from "./employees";
export {
  listPayPeriods,
  createPayPeriod,
  getPayPeriod,
  generateDraftRecords,
  updatePayrollRecord,
  approvePayPeriod,
  markPayPeriodPaid,
} from "./periods";
export {
  employeeInputSchema,
  employeeUpdateSchema,
  payPeriodInputSchema,
  payrollRecordUpdateSchema,
  PAYROLL_EMPLOYEE_TYPES,
} from "./schema";
export type { EmployeeInput, EmployeeUpdate, PayPeriodInput, PayrollRecordUpdate } from "./schema";
