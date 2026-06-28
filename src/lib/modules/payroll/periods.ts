import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { PayrollError } from "./errors";
import { payPeriodInputSchema, payrollRecordUpdateSchema, PAYROLL_EMPLOYEE_TYPES } from "./schema";

const num = (d: unknown): number => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Net = base salary + hourly + commission + bonus + reimbursements − deductions. */
function computeNet(p: {
  grossSalary: number;
  hourlyPay: number;
  commissionPay: number;
  bonus: number;
  deductions: number;
  reimbursements: number;
}): number {
  return round2(p.grossSalary + p.hourlyPay + p.commissionPay + p.bonus + p.reimbursements - p.deductions);
}

export async function listPayPeriods() {
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { records: true } } },
  });
  return periods.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.status,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    recordCount: p._count.records,
  }));
}

export async function createPayPeriod(input: unknown, actor?: { userId?: string }) {
  const parsed = payPeriodInputSchema.parse(input);
  if (parsed.endDate < parsed.startDate) throw new PayrollError("invalid_range", 400);
  const period = await prisma.payPeriod.create({
    data: { label: parsed.label, startDate: parsed.startDate, endDate: parsed.endDate, status: "DRAFT" },
  });
  await writeAudit({ action: "pay_period.created", entityType: "PayPeriod", entityId: period.id, actorId: actor?.userId ?? null });
  return period;
}

/** One pay period with its records (+ employee names). */
export async function getPayPeriod(id: string) {
  const period = await prisma.payPeriod.findUnique({
    where: { id },
    include: {
      records: {
        include: { employee: { select: { employeeType: true, hourlyRate: true, user: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!period) throw new PayrollError("pay_period_not_found", 404);

  let gross = 0;
  let net = 0;
  const records = period.records.map((r) => {
    gross += num(r.grossSalary) + num(r.hourlyPay) + num(r.commissionPay) + num(r.bonus);
    net += num(r.netPay);
    return {
      id: r.id,
      employeeName: r.employee?.user?.name ?? "—",
      employeeType: r.employee?.employeeType ?? "—",
      hourlyRate: num(r.employee?.hourlyRate),
      status: r.status,
      grossSalary: num(r.grossSalary),
      hoursWorked: num(r.hoursWorked),
      hourlyPay: num(r.hourlyPay),
      commissionPay: num(r.commissionPay),
      bonus: num(r.bonus),
      deductions: num(r.deductions),
      reimbursements: num(r.reimbursements),
      netPay: num(r.netPay),
      notes: r.notes,
    };
  });

  return {
    id: period.id,
    label: period.label,
    status: period.status,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    totals: { gross: round2(gross), net: round2(net) },
    records,
  };
}

/**
 * Create a draft PayrollRecord for every ACTIVE payroll-eligible employee not already in the period.
 * Salaried/mixed employees are prefilled with their base salary as the period gross; hourly start at
 * zero until hours are entered. Only allowed while the period is DRAFT.
 */
export async function generateDraftRecords(payPeriodId: string, actor?: { userId?: string }) {
  const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId }, select: { status: true } });
  if (!period) throw new PayrollError("pay_period_not_found", 404);
  if (period.status !== "DRAFT") throw new PayrollError("period_locked", 409);

  const [employees, existing] = await Promise.all([
    prisma.employee.findMany({
      where: { employeeType: { in: [...PAYROLL_EMPLOYEE_TYPES] }, employmentStatus: "ACTIVE" },
      select: { id: true, compensationType: true, baseSalary: true },
    }),
    prisma.payrollRecord.findMany({ where: { payPeriodId }, select: { employeeId: true } }),
  ]);
  const have = new Set(existing.map((r) => r.employeeId));

  let created = 0;
  for (const e of employees) {
    if (have.has(e.id)) continue;
    const grossSalary =
      e.compensationType === "SALARY" || e.compensationType === "MIXED" ? num(e.baseSalary) : 0;
    await prisma.payrollRecord.create({
      data: {
        payPeriodId,
        employeeId: e.id,
        status: "DRAFT",
        grossSalary,
        netPay: round2(grossSalary),
      },
    });
    created++;
  }
  await writeAudit({ action: "payroll.generated", entityType: "PayPeriod", entityId: payPeriodId, actorId: actor?.userId ?? null, metadata: { created } });
  return { created, skipped: employees.length - created };
}

/** Edit a draft payroll record; recomputes hourly pay (rate × hours) and net. */
export async function updatePayrollRecord(id: string, input: unknown, actor?: { userId?: string }) {
  const parsed = payrollRecordUpdateSchema.parse(input);
  const rec = await prisma.payrollRecord.findUnique({
    where: { id },
    include: { employee: { select: { hourlyRate: true } }, payPeriod: { select: { status: true } } },
  });
  if (!rec) throw new PayrollError("record_not_found", 404);
  if (rec.payPeriod.status !== "DRAFT") throw new PayrollError("period_locked", 409);

  const hoursWorked = parsed.hoursWorked ?? num(rec.hoursWorked);
  const hourlyPay = round2(num(rec.employee?.hourlyRate) * hoursWorked);
  const grossSalary = parsed.grossSalary ?? num(rec.grossSalary);
  const commissionPay = parsed.commissionPay ?? num(rec.commissionPay);
  const bonus = parsed.bonus ?? num(rec.bonus);
  const deductions = parsed.deductions ?? num(rec.deductions);
  const reimbursements = parsed.reimbursements ?? num(rec.reimbursements);
  const netPay = computeNet({ grossSalary, hourlyPay, commissionPay, bonus, deductions, reimbursements });

  const updated = await prisma.payrollRecord.update({
    where: { id },
    data: {
      grossSalary,
      hoursWorked,
      hourlyPay,
      commissionPay,
      bonus,
      deductions,
      reimbursements,
      netPay,
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    },
  });
  await writeAudit({ action: "payroll.record_updated", entityType: "PayrollRecord", entityId: id, actorId: actor?.userId ?? null });
  return { id: updated.id, netPay: num(updated.netPay), hourlyPay: num(updated.hourlyPay) };
}

/** Lock + approve a draft period (and all its records). */
export async function approvePayPeriod(id: string, actor: { userId: string }) {
  const period = await prisma.payPeriod.findUnique({ where: { id }, select: { status: true } });
  if (!period) throw new PayrollError("pay_period_not_found", 404);
  if (period.status !== "DRAFT") throw new PayrollError("not_draft", 409);
  const now = new Date();
  await prisma.$transaction([
    prisma.payrollRecord.updateMany({ where: { payPeriodId: id }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: now } }),
    prisma.payPeriod.update({ where: { id }, data: { status: "APPROVED" } }),
  ]);
  await writeAudit({ action: "payroll.approved", entityType: "PayPeriod", entityId: id, actorId: actor.userId });
  return { ok: true };
}

/** Mark an approved period paid (records + period). */
export async function markPayPeriodPaid(id: string, actor: { userId: string }) {
  const period = await prisma.payPeriod.findUnique({ where: { id }, select: { status: true } });
  if (!period) throw new PayrollError("pay_period_not_found", 404);
  if (period.status !== "APPROVED") throw new PayrollError("not_approved", 409);
  const now = new Date();
  await prisma.$transaction([
    prisma.payrollRecord.updateMany({ where: { payPeriodId: id }, data: { status: "PAID", paidAt: now } }),
    prisma.payPeriod.update({ where: { id }, data: { status: "PAID" } }),
  ]);
  await writeAudit({ action: "payroll.paid", entityType: "PayPeriod", entityId: id, actorId: actor.userId });
  return { ok: true };
}
