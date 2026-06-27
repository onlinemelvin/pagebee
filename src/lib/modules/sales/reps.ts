import { prisma } from "@/lib/db";
import { createAuthUser, findAuthUserId, deleteAuthUser } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/modules/audit";
import { SalesError } from "./errors";
import { provisionRepInputSchema } from "./schema";
import { getCommissionTerms, renderCommissionTerms } from "./contracts";

/**
 * Provision a commission sales rep (admin action). Creates the Supabase Auth identity, then — in one
 * transaction — a PLATFORM `User` with the SALES_REP role, an `Employee{COMMISSION_REP}`, and a
 * `SALES_REP_COMMISSION` `Contract` in SENT status (company-offered, awaiting the rep's e-signature).
 * The rep can log into /rep immediately but can't sell until they sign (see `signContract`).
 */
export async function provisionRep(input: unknown, actor?: { userId?: string }) {
  const parsed = provisionRepInputSchema.parse(input);
  const email = parsed.email.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new SalesError("email_taken", 409);
  }

  // Supabase Auth identity (auto-confirmed). Tolerate a pre-existing auth user (reuse its id).
  const created = await createAuthUser(email, parsed.password);
  let supabaseUserId: string | undefined;
  if (created.ok) {
    supabaseUserId = created.id;
  } else if (created.status === 422 || created.status === 409) {
    supabaseUserId = await findAuthUserId(email);
    if (!supabaseUserId) throw new SalesError("email_taken", 409);
  } else {
    throw new SalesError(created.error, 502);
  }

  const terms = await getCommissionTerms();
  const commissionTerms = renderCommissionTerms(terms);

  const result = await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name: "SALES_REP" },
      update: {},
      create: { name: "SALES_REP", description: "Commission sales rep (portal access)" },
    });
    const user = await tx.user.create({
      data: { email, name: parsed.name, type: "PLATFORM", status: "ACTIVE", supabaseUserId },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const employee = await tx.employee.create({
      data: {
        userId: user.id,
        employeeType: "COMMISSION_REP",
        compensationType: "COMMISSION",
        employmentStatus: "ACTIVE",
        title: parsed.title ?? "Sales rep",
        startDate: new Date(),
      },
    });
    const contract = await tx.contract.create({
      data: {
        type: "SALES_REP_COMMISSION",
        status: "SENT",
        title: "Sales-Rep Commission Agreement",
        employeeId: employee.id,
        effectiveDate: new Date(),
        compensationTerms: "Independent contractor; commission-only. See commission terms.",
        commissionTerms,
      },
    });
    return { userId: user.id, repId: employee.id, contractId: contract.id };
  });

  await writeAudit({
    action: "rep.provisioned",
    entityType: "Employee",
    entityId: result.repId,
    actorId: actor?.userId ?? null,
    metadata: { email, contractId: result.contractId },
  });
  return result;
}

/**
 * Admin sets/clears a rep's certification. Certified reps may create quotes; uncertified reps can
 * still run the CRM but not quote (gate enforced by `requireCertifiedRep`). See SALES_REP_PROGRAM.md §8.
 */
export async function certifyRep(repId: string, certified: boolean, actor?: { userId?: string }) {
  const rep = await prisma.employee.findFirst({
    where: { id: repId, employeeType: "COMMISSION_REP" },
    select: { id: true },
  });
  if (!rep) throw new SalesError("rep_not_found", 404);
  const updated = await prisma.employee.update({
    where: { id: repId },
    data: { certifiedAt: certified ? new Date() : null },
  });
  await writeAudit({
    action: certified ? "rep.certified" : "rep.decertified",
    entityType: "Employee",
    entityId: repId,
    actorId: actor?.userId ?? null,
  });
  return updated;
}

/**
 * Permanently delete a commission rep — their portal login, employee record, contract(s), prospect
 * assignments and any draft/sent quotes. Prospects themselves are company assets and are left in place
 * (only the rep's assignment is removed).
 *
 * Guardrail: a rep with **commission records** carries a financial/audit trail (money pending, eligible,
 * or paid) and is refused — those reps should be deactivated, not erased. Use `force` only to override
 * when you've accepted that the commission history will be destroyed too. See SALES_REP_PROGRAM.md §8.
 */
export async function deleteRep(repId: string, opts?: { force?: boolean; actor?: { userId?: string } }) {
  const rep = await prisma.employee.findFirst({
    where: { id: repId, employeeType: "COMMISSION_REP" },
    select: { id: true, userId: true, user: { select: { email: true, supabaseUserId: true } }, _count: { select: { commissionRecords: true } } },
  });
  if (!rep) throw new SalesError("rep_not_found", 404);
  if (rep._count.commissionRecords > 0 && !opts?.force) throw new SalesError("rep_has_commissions", 409);

  await prisma.$transaction(async (tx) => {
    await tx.quote.deleteMany({ where: { salesRepId: repId } });
    await tx.salesAssignment.deleteMany({ where: { employeeId: repId } });
    await tx.contract.deleteMany({ where: { employeeId: repId } });
    await tx.payrollRecord.deleteMany({ where: { employeeId: repId } });
    if (opts?.force) await tx.commissionRecord.deleteMany({ where: { employeeId: repId } });
    await tx.employee.delete({ where: { id: repId } });
    if (rep.userId) {
      await tx.userRole.deleteMany({ where: { userId: rep.userId } });
      await tx.user.delete({ where: { id: rep.userId } });
    }
  });

  // Best-effort auth cleanup — the DB record is already gone, so don't fail the delete on this.
  if (rep.user?.supabaseUserId) await deleteAuthUser(rep.user.supabaseUserId);

  await writeAudit({
    action: "rep.deleted",
    entityType: "Employee",
    entityId: repId,
    actorId: opts?.actor?.userId ?? null,
    metadata: { email: rep.user?.email ?? null, forced: Boolean(opts?.force), commissionRecords: rep._count.commissionRecords },
  });
  return { id: repId };
}

export interface RepSummary {
  id: string;
  name: string;
  email: string;
  title: string | null;
  status: string;
  contractStatus: string | null;
  certified: boolean;
  prospects: number;
  conversions: number;
}

/** All commission reps with headline counts — powers the admin reps roster. */
export async function listReps(): Promise<RepSummary[]> {
  const reps = await prisma.employee.findMany({
    where: { employeeType: "COMMISSION_REP" },
    include: {
      user: { select: { name: true, email: true } },
      contracts: {
        where: { type: "SALES_REP_COMMISSION" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
      _count: { select: { salesAssignments: true, commissionRecords: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reps.map((r) => ({
    id: r.id,
    name: r.user?.name ?? "—",
    email: r.user?.email ?? "—",
    title: r.title,
    status: r.employmentStatus,
    contractStatus: r.contracts[0]?.status ?? null,
    certified: Boolean(r.certifiedAt),
    prospects: r._count.salesAssignments,
    conversions: r._count.commissionRecords,
  }));
}
