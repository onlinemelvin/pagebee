import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { listUpgradeRequests } from "@/lib/modules/subscription";
import { ApplyUpgradeButton } from "@/components/admin/ApplyUpgradeButton";
import { EmptyState } from "@/components/client/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function AdminUpgradeRequestsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");
  const requests = await listUpgradeRequests();

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Upgrade requests</h1>
      <p className="mt-1 text-sm text-stone-500">
        Real-account upgrade requests awaiting action. (Test accounts upgrade instantly.)
      </p>

      {requests.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={CheckCircle2}
          title="No pending requests"
          description="When a real-account client requests a plan change, it'll show up here for one-click approval."
        />
      ) : (
      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Change</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Requested</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50">
                <td className="px-4 py-3 font-medium text-stone-900">{r.client.businessName}</td>
                <td className="px-4 py-3 text-stone-600">
                  {r.fromPlan} → <span className="font-semibold text-stone-900">{r.toPlan}</span>
                </td>
                <td className="px-4 py-3 text-stone-500">{r.reason ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-500">{r.createdAt.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <ApplyUpgradeButton id={r.id} />
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
