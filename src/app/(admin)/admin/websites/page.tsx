import Link from "next/link";
import { listReviewQueue, listGenerationActivity } from "@/lib/modules/website";
import { openChangeRequestCounts } from "@/lib/modules/review";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { RetryJobButton } from "@/components/admin/RetryJobButton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type QueueItem = Awaited<ReturnType<typeof listReviewQueue>>[number];
type ActivityItem = Awaited<ReturnType<typeof listGenerationActivity>>[number];

const JOB_BADGE: Record<string, string> = {
  QUEUED: "bg-stone-100 text-stone-600",
  GENERATING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
};

function JobCard({ job }: { job: ActivityItem }) {
  const prog = (job.output ?? {}) as { stage?: string; percent?: number };
  const isFailed = job.status === "FAILED";
  const isGenerating = job.status === "GENERATING";
  const percent = isFailed ? 100 : isGenerating ? prog.percent ?? 10 : 6;
  const label = isFailed
    ? "Generation failed"
    : isGenerating
      ? prog.stage ?? "Building with AI…"
      : "Queued — waiting to start";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-stone-900">{job.website.client.businessName}</p>
          <p className="text-xs text-stone-400">
            {job.website.subdomain} · started {job.createdAt.toLocaleTimeString()}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${JOB_BADGE[job.status] ?? "bg-stone-100 text-stone-600"}`}>
          {job.status}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isFailed ? "bg-red-500" : "bg-amber-500",
            job.status === "QUEUED" && "animate-pulse",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className={cn("text-sm", isFailed ? "font-medium text-red-700" : "text-stone-600")}>{label}</p>
        {isFailed && <RetryJobButton jobId={job.id} />}
      </div>
      {isFailed && job.error && (
        <p className="mt-2 break-words rounded-lg bg-red-50 p-2 font-mono text-[11px] text-red-700">{job.error}</p>
      )}
    </div>
  );
}

function Row({ v, count }: { v: QueueItem; count: number }) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-stone-900">{v.website.client.businessName}</td>
      <td className="px-4 py-3 text-stone-600">v{v.version}</td>
      <td className="px-4 py-3">
        {count ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{count} open</span>
        ) : (
          <span className="text-stone-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-stone-500">{v.createdAt.toLocaleString()}</td>
      <td className="px-4 py-3 text-right">
        <Link href={`/admin/websites/${v.id}`} className="font-medium text-amber-700 hover:underline">
          Open →
        </Link>
      </td>
    </tr>
  );
}

function Table({
  items,
  counts,
  empty,
}: {
  items: QueueItem[];
  counts: Record<string, number>;
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Business</th>
            <th className="px-4 py-3 font-medium">Version</th>
            <th className="px-4 py-3 font-medium">Comments</th>
            <th className="px-4 py-3 font-medium">Generated</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-stone-400">{empty}</td>
            </tr>
          ) : (
            items.map((v) => <Row key={v.id} v={v} count={counts[v.id] ?? 0} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminWebsitesPage() {
  const [queue, activity] = await Promise.all([listReviewQueue(), listGenerationActivity()]);
  const counts = await openChangeRequestCounts(queue.map((v) => v.id));

  // The review queue shows only drafts still awaiting review. Once released to the client
  // the reviewer's job is done; those move to a separate list (still publishable later).
  const needsReview = queue.filter((v) => !v.config?.adminReviewed);
  const released = queue.filter((v) => v.config?.adminReviewed);

  const inFlight = activity.filter((j) => j.status === "QUEUED" || j.status === "GENERATING");
  const failed = activity.filter((j) => j.status === "FAILED");

  return (
    <div>
      {/* Live-refresh while anything is building, so progress updates without a manual reload. */}
      {inFlight.length > 0 && <AutoRefresh intervalMs={2500} />}

      <h1 className="font-display text-2xl text-stone-900">Websites — review queue</h1>
      <p className="mt-1 text-sm text-stone-500">
        Generated drafts awaiting review. Review one, then release it to the client (or request changes).
      </p>

      {(inFlight.length > 0 || failed.length > 0) && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Generation activity
          </h2>
          <p className="mt-1 text-sm text-stone-400">
            Builds appear here the moment a client requests one — live progress, and failures you can retry.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {inFlight.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
            {failed.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <Table
          items={needsReview}
          counts={counts}
          empty="Nothing to review. Drafts appear here after a client generates a website."
        />
      </div>

      {released.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Released to client — awaiting approval
          </h2>
          <p className="mt-1 text-sm text-stone-400">
            The client can now review these. They go live when approved &amp; published.
          </p>
          <div className="mt-3">
            <Table items={released} counts={counts} empty="" />
          </div>
        </div>
      )}
    </div>
  );
}
