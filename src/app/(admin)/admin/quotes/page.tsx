import { listPendingApprovals } from "@/lib/modules/sales";
import { ApprovalQueue, type ApprovalRow } from "@/components/admin/ApprovalQueue";

export const dynamic = "force-dynamic";

export default async function AdminQuotesPage() {
  const approvals = await listPendingApprovals();
  const rows: ApprovalRow[] = approvals.map((a) => {
    const q = a.quote;
    const reasons: string[] = [];
    if (q.offeredMonthlyFee < q.listedMonthlyFee) reasons.push("monthly_discount");
    if (q.offeredSetupFee <= 0) reasons.push("setup_waived");
    else if (q.discounts.some((d) => d.target === "setup_fee" && d.requiresApproval)) reasons.push("setup_below_floor");
    if (q.offeredMonthlyFee < q.listedMonthlyFee && q.offeredSetupFee < q.listedSetupFee) reasons.push("multiple_discounts");

    return {
      id: a.id,
      quoteId: q.id,
      rep: q.salesRep?.user?.name ?? "—",
      prospect: q.prospect?.businessName ?? "—",
      plan: q.plan,
      listedSetup: q.listedSetupFee,
      offeredSetup: q.offeredSetupFee,
      listedMonthly: q.listedMonthlyFee,
      offeredMonthly: q.offeredMonthlyFee,
      reasons: [...new Set(reasons)],
      createdAt: a.createdAt.toISOString(),
    };
  });

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Quote approvals</h1>
      <p className="mt-1 text-sm text-stone-500">Out-of-guardrail offers awaiting sign-off.</p>
      <div className="mt-6">
        <ApprovalQueue initial={rows} />
      </div>
    </div>
  );
}
