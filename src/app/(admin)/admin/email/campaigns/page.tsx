import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Megaphone } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { listCampaigns } from "@/lib/modules/email";
import { EmptyState } from "@/components/client/ui/EmptyState";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  SCHEDULED: "bg-sky-100 text-sky-700",
  SENDING: "bg-amber-100 text-amber-800",
  SENT: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

export default async function CampaignsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const campaigns = await listCampaigns();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Campaigns</h1>
          <p className="mt-1 text-sm text-stone-500">Bulk emails to your clients — drafts, scheduled, and sent.</p>
        </div>
        <Link href="/admin/email/campaigns/new" className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400">
          <Plus size={15} /> New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to send tips, announcements, or offers to your clients." />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2.5 font-medium">Campaign</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Recipients</th>
                <th className="px-4 py-2.5 font-medium">Sent / Opened</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-800">{c.name}</div>
                    <div className="max-w-[280px] truncate text-xs text-stone-400">{c.subject}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[c.status] ?? "bg-stone-100 text-stone-600"}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c.totalRecipients || "—"}</td>
                  <td className="px-4 py-3 text-stone-600">{c.sentCount} / {c.openedCount}</td>
                  <td className="px-4 py-3 text-xs text-stone-400">
                    {c.sentAt ? `Sent ${c.sentAt.toLocaleString()}` : c.scheduledAt ? `Scheduled ${c.scheduledAt.toLocaleString()}` : `Created ${c.createdAt.toLocaleDateString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
