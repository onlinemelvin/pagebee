import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { PayrollError } from "./errors";
import { employeeInputSchema, employeeUpdateSchema, PAYROLL_EMPLOYEE_TYPES } from "./schema";

/**
 * Internal-staff (payroll) employee management. Commission reps (EmployeeType.COMMISSION_REP) are
 * provisioned + settled through the sales module, so they're excluded here. Each employee is backed
 * by a User (name/email, status INVITED — no auth identity until separately invited) so we have a
 * display name; comp lives on the Employee row.
 */

const num = (d: unknown): number => Number(d ?? 0);

export interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  employeeType: string;
  compensationType: string;
  employmentStatus: string;
  baseSalary: number;
  hourlyRate: number;
}

function toRow(e: {
  id: string;
  title: string | null;
  employeeType: string;
  compensationType: string;
  employmentStatus: string;
  baseSalary: unknown;
  hourlyRate: unknown;
  user: { name: string; email: string } | null;
}): EmployeeRow {
  return {
    id: e.id,
    name: e.user?.name ?? "—",
    email: e.user?.email ?? "—",
    title: e.title,
    employeeType: e.employeeType,
    compensationType: e.compensationType,
    employmentStatus: e.employmentStatus,
    baseSalary: num(e.baseSalary),
    hourlyRate: num(e.hourlyRate),
  };
}

const SELECT = {
  id: true,
  title: true,
  employeeType: true,
  compensationType: true,
  employmentStatus: true,
  baseSalary: true,
  hourlyRate: true,
  user: { select: { name: true, email: true } },
} as const;

/** List payroll-eligible internal staff (excludes commission reps), newest first. */
export async function listEmployees(): Promise<EmployeeRow[]> {
  const rows = await prisma.employee.findMany({
    where: { employeeType: { in: [...PAYROLL_EMPLOYEE_TYPES] } },
    select: SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRow);
}

/** Create an internal employee + its backing User (status INVITED — no auth identity yet). */
export async function createEmployee(input: unknown, actor?: { userId?: string }): Promise<EmployeeRow> {
  const parsed = employeeInputSchema.parse(input);
  const email = parsed.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new PayrollError("email_taken", 409);
  }

  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: parsed.name, type: "PLATFORM", status: "INVITED" },
    });
    return tx.employee.create({
      data: {
        userId: user.id,
        employeeType: parsed.employeeType,
        compensationType: parsed.compensationType,
        employmentStatus: "ACTIVE",
        title: parsed.title,
        startDate: new Date(),
        baseSalary: parsed.baseSalary ?? null,
        hourlyRate: parsed.hourlyRate ?? null,
      },
      select: SELECT,
    });
  });

  await writeAudit({
    action: "employee.created",
    entityType: "Employee",
    entityId: employee.id,
    actorId: actor?.userId ?? null,
    metadata: { email, type: parsed.employeeType },
  });
  return toRow(employee);
}

/** Update an internal employee's title / status / comp. */
export async function updateEmployee(id: string, input: unknown, actor?: { userId?: string }): Promise<EmployeeRow> {
  const parsed = employeeUpdateSchema.parse(input);
  const existing = await prisma.employee.findFirst({
    where: { id, employeeType: { in: [...PAYROLL_EMPLOYEE_TYPES] } },
    select: { id: true },
  });
  if (!existing) throw new PayrollError("employee_not_found", 404);

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.employmentStatus ? { employmentStatus: parsed.employmentStatus } : {}),
      ...(parsed.baseSalary !== undefined ? { baseSalary: parsed.baseSalary } : {}),
      ...(parsed.hourlyRate !== undefined ? { hourlyRate: parsed.hourlyRate } : {}),
      ...(parsed.employmentStatus === "TERMINATED" ? { endDate: new Date() } : {}),
    },
    select: SELECT,
  });
  await writeAudit({
    action: "employee.updated",
    entityType: "Employee",
    entityId: id,
    actorId: actor?.userId ?? null,
    metadata: { status: parsed.employmentStatus ?? null },
  });
  return toRow(employee);
}
