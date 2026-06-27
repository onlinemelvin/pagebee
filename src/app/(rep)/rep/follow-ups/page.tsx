import { getRepWorkspace, listFollowUps } from "@/lib/modules/sales";
import { FollowUpsList, type FollowUpRow } from "@/components/rep/FollowUpsList";

export const dynamic = "force-dynamic";

export default async function RepFollowUpsPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;

  const now = Date.now();
  const followUps = await listFollowUps(ws.employee.id);
  const rows: FollowUpRow[] = followUps.map((f) => ({
    id: f.id,
    dueAt: f.dueAt.toISOString(),
    note: f.note,
    overdue: f.dueAt.getTime() <= now,
    prospect: { id: f.prospect.id, businessName: f.prospect.businessName },
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Follow-ups</h1>
        <p className="mt-1 text-sm text-stone-500">Stay on top of every prospect you&apos;ve promised to circle back to.</p>
      </div>
      <FollowUpsList initial={rows} />
    </div>
  );
}
