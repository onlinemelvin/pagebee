import { z } from "zod";

/** Payroll-eligible internal staff. Commission reps are paid via the sales flow, not payroll. */
export const PAYROLL_EMPLOYEE_TYPES = ["SALARIED", "HOURLY", "SUPPORT_AGENT", "ADMIN", "CONTRACTOR"] as const;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

export const employeeInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  employeeType: z.enum(PAYROLL_EMPLOYEE_TYPES),
  compensationType: z.enum(["SALARY", "HOURLY", "MIXED"]),
  title: optionalTrimmed(120),
  baseSalary: z.number().min(0).max(100_000_000).optional(), // dollars/period
  hourlyRate: z.number().min(0).max(100_000).optional(),
});
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const employeeUpdateSchema = z.object({
  title: optionalTrimmed(120),
  employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
  baseSalary: z.number().min(0).max(100_000_000).optional(),
  hourlyRate: z.number().min(0).max(100_000).optional(),
});
export type EmployeeUpdate = z.infer<typeof employeeUpdateSchema>;

export const payPeriodInputSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type PayPeriodInput = z.infer<typeof payPeriodInputSchema>;

export const payrollRecordUpdateSchema = z.object({
  grossSalary: z.number().min(0).max(100_000_000).optional(),
  hoursWorked: z.number().min(0).max(1000).optional(),
  commissionPay: z.number().min(0).max(100_000_000).optional(),
  bonus: z.number().min(0).max(100_000_000).optional(),
  deductions: z.number().min(0).max(100_000_000).optional(),
  reimbursements: z.number().min(0).max(100_000_000).optional(),
  notes: optionalTrimmed(1000),
});
export type PayrollRecordUpdate = z.infer<typeof payrollRecordUpdateSchema>;
