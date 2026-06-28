import { listSettlementQueue } from "@/lib/modules/sales";
import { SettlementQueue, type RepSettlementGroup } from "@/components/admin/SettlementQueue";

export const dynamic = "force-dynamic";

export default async function AdminCommissionsPage() {
  const reps = await listSettlementQueue();
  const groups: RepSettlementGroup[] = reps.map((r) => ({
    repId: r.repId,
    repName: r.repName,
    eligibleTotal: r.eligibleTotal,
    approvedTotal: r.approvedTotal,
    records: r.records.map((rec) => ({
      id: rec.id,
      status: rec.status,
      basis: rec.basis,
      amount: rec.amount,
      clientName: rec.clientName,
    })),
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Commissions</h1>
      <p className="mt-1 text-sm text-stone-500">
        Approve eligible commissions, then mark them paid once settled via the hiring platform.
      </p>
      <div className="mt-6">
        <SettlementQueue initial={groups} />
      </div>
    </div>
  );
}
