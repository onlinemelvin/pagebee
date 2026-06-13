import type { LeadStatus } from "@prisma/client";
import { listLeads, LEAD_STATUSES } from "@/lib/modules/lead";
import { LeadInbox, type LeadRow } from "@/components/admin/LeadInbox";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const status =
    statusParam && (LEAD_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as LeadStatus)
      : undefined;

  const leads = await listLeads({ status });

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    message: l.message,
    type: l.type,
    status: l.status,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Leads</h1>
      <p className="mt-1 text-sm text-stone-500">Inquiries captured across all client websites.</p>
      <LeadInbox leads={rows} activeStatus={status ?? null} />
    </div>
  );
}
