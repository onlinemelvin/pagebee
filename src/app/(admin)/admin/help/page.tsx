import { LifeBuoy, ExternalLink } from "lucide-react";
import { listHelpRequests } from "@/lib/modules/sales";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ResolveHelpButton } from "@/components/admin/ResolveHelpButton";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage() {
  const requests = await listHelpRequests();
  const open = requests.filter((r) => r.status === "OPEN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Help requests</h1>
        <p className="mt-1 text-sm text-stone-500">
          Technical help raised by sales reps. {open.length} open.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <LifeBuoy size={28} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">No help requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <section
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-stone-900">{r.repName ?? "Rep"}</p>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{r.message}</p>
                {r.previewId ? (
                  <a
                    href={`/admin/websites`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                  >
                    <ExternalLink size={12} /> Related preview
                  </a>
                ) : null}
              </div>
              {r.status === "OPEN" ? <ResolveHelpButton id={r.id} /> : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
