import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { SalesError } from "./errors";

/**
 * Commission settlement (Phase 3 of internal ops). The accrual engine produces ELIGIBLE records;
 * an admin then APPROVES them and marks them PAID once settled out-of-band (Upwork/Fiverr milestone —
 * see SALES_REP_PROGRAM.md §6). Payout reference is stored on the record's `notes`. No money moves
 * through PageBee here; this is the bookkeeping ledger for what reps are owed and have been paid.
 */

export interface SettlementRow {
  id: string;
  status: string;
  basis: string;
  amount: number;
  collectedRevenue: number;
  clientName: string | null;
  eligibleAt: string | null;
  createdAt: string;
}
export interface RepSettlement {
  repId: string;
  repName: string;
  eligibleTotal: number;
  approvedTotal: number;
  records: SettlementRow[];
}

function n(d: unknown): number {
  return Number(d ?? 0);
}

/** The admin settlement queue: ELIGIBLE + APPROVED records grouped by rep, with per-rep totals. */
export async function listSettlementQueue(): Promise<RepSettlement[]> {
  const records = await prisma.commissionRecord.findMany({
    where: { status: { in: ["ELIGIBLE", "APPROVED"] } },
    include: {
      employee: { select: { id: true, user: { select: { name: true } } } },
      client: { select: { businessName: true } },
    },
    orderBy: { eligibleAt: "asc" },
  });

  const byRep = new Map<string, RepSettlement>();
  for (const r of records) {
    const repId = r.employeeId;
    const group =
      byRep.get(repId) ??
      byRep.set(repId, {
        repId,
        repName: r.employee?.user?.name ?? "—",
        eligibleTotal: 0,
        approvedTotal: 0,
        records: [],
      }).get(repId)!;
    const amount = n(r.amount);
    if (r.status === "ELIGIBLE") group.eligibleTotal += amount;
    else group.approvedTotal += amount;
    group.records.push({
      id: r.id,
      status: r.status,
      basis: r.basis,
      amount,
      collectedRevenue: n(r.collectedRevenue),
      clientName: r.client?.businessName ?? null,
      eligibleAt: r.eligibleAt ? r.eligibleAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return [...byRep.values()].sort((a, b) => b.eligibleTotal + b.approvedTotal - (a.eligibleTotal + a.approvedTotal));
}

/** Approve an ELIGIBLE commission for payout. */
export async function approveCommission(recordId: string, admin: { userId: string }) {
  const rec = await prisma.commissionRecord.findUnique({ where: { id: recordId }, select: { status: true } });
  if (!rec) throw new SalesError("commission_not_found", 404);
  if (rec.status !== "ELIGIBLE") throw new SalesError("not_eligible", 409);
  const updated = await prisma.commissionRecord.update({
    where: { id: recordId },
    data: { status: "APPROVED", approvedById: admin.userId, approvedAt: new Date() },
  });
  await writeAudit({ action: "commission.approved", entityType: "CommissionRecord", entityId: recordId, actorId: admin.userId });
  return updated;
}

/**
 * Mark one or more APPROVED commissions PAID, stamping `paidAt` and appending the payout reference
 * (e.g. an Upwork milestone id) to each record's notes. Only APPROVED records are affected.
 */
export async function markCommissionsPaid(
  recordIds: string[],
  payoutReference: string,
  admin: { userId: string },
) {
  const ref = payoutReference.trim();
  if (!ref) throw new SalesError("payout_reference_required", 400);
  const ids = [...new Set(recordIds)].filter(Boolean);
  if (ids.length === 0) throw new SalesError("no_records", 400);

  const approved = await prisma.commissionRecord.findMany({
    where: { id: { in: ids }, status: "APPROVED" },
    select: { id: true, notes: true },
  });
  if (approved.length === 0) throw new SalesError("no_approved_records", 409);

  const now = new Date();
  await prisma.$transaction(
    approved.map((r) =>
      prisma.commissionRecord.update({
        where: { id: r.id },
        data: {
          status: "PAID",
          paidAt: now,
          notes: r.notes ? `${r.notes}\nPaid: ${ref}` : `Paid: ${ref}`,
        },
      }),
    ),
  );
  await writeAudit({
    action: "commission.paid",
    entityType: "CommissionRecord",
    actorId: admin.userId,
    metadata: { recordIds: approved.map((r) => r.id), payoutReference: ref },
  });
  return { paid: approved.length };
}

/** A rep's full commission statement: every record + totals by status. Drives the rep earnings page. */
export async function repCommissionStatement(repId: string) {
  const records = await prisma.commissionRecord.findMany({
    where: { employeeId: repId },
    include: { client: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const totals = { pending: 0, eligible: 0, approved: 0, paid: 0, clawedBack: 0 };
  const key: Record<string, keyof typeof totals> = {
    PENDING: "pending",
    ELIGIBLE: "eligible",
    APPROVED: "approved",
    PAID: "paid",
    CLAWED_BACK: "clawedBack",
  };
  const rows: SettlementRow[] = records.map((r) => {
    const k = key[r.status];
    if (k) totals[k] += n(r.amount);
    return {
      id: r.id,
      status: r.status,
      basis: r.basis,
      amount: n(r.amount),
      collectedRevenue: n(r.collectedRevenue),
      clientName: r.client?.businessName ?? null,
      eligibleAt: r.eligibleAt ? r.eligibleAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
  return { totals, records: rows };
}
