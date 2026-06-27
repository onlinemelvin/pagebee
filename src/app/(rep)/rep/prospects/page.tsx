import { getRepWorkspace, listProspects } from "@/lib/modules/sales";
import { ProspectsManager, type ProspectRow } from "@/components/rep/ProspectsManager";

export const dynamic = "force-dynamic";

export default async function RepProspectsPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;

  const prospects = await listProspects(ws.employee.id);
  const rows: ProspectRow[] = prospects.map((p) => {
    const counts = (p as { _count?: { activities: number; followUps: number; quotes: number } })._count;
    return {
      id: p.id,
      businessName: p.businessName,
      contactName: p.contactName,
      email: p.email,
      phone: p.phone,
      status: p.status,
      source: p.source,
      updatedAt: p.updatedAt.toISOString(),
      counts: {
        activities: counts?.activities ?? 0,
        followUps: counts?.followUps ?? 0,
        quotes: counts?.quotes ?? 0,
      },
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Prospects</h1>
        <p className="mt-1 text-sm text-stone-500">Businesses you&apos;re working. Each one is yours alone.</p>
      </div>
      <ProspectsManager initialProspects={rows} canAdd={ws.hasActiveContract} />
    </div>
  );
}
