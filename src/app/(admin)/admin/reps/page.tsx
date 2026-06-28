import { listReps, listRepResources, repPerformance, discountImpact } from "@/lib/modules/sales";
import { RepRoster, type RepSummaryRow } from "@/components/admin/RepRoster";
import { ResourceManager, type ResourceGroupRow } from "@/components/admin/ResourceManager";
import { SalesAnalytics } from "@/components/admin/SalesAnalytics";

export const dynamic = "force-dynamic";

export default async function AdminRepsPage() {
  const [reps, groups, performance, discount] = await Promise.all([
    listReps(),
    listRepResources(),
    repPerformance(),
    discountImpact(),
  ]);
  const rows: RepSummaryRow[] = reps.map((r) => ({ ...r }));
  const resourceGroups: ResourceGroupRow[] = groups.map((g) => ({
    group: g.group,
    items: g.items.map((i) => ({ id: i.id, title: i.title, url: i.url, group: i.group })),
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Sales reps</h1>
      <p className="mt-1 text-sm text-stone-500">Commission reps, their contract status, and conversions.</p>
      <div className="mt-6">
        <RepRoster initialReps={rows} />
      </div>
      <div className="mt-10 border-t border-stone-200 pt-8">
        <SalesAnalytics reps={performance} discount={discount} />
      </div>
      <div className="mt-10 border-t border-stone-200 pt-8">
        <ResourceManager initialGroups={resourceGroups} />
      </div>
    </div>
  );
}
