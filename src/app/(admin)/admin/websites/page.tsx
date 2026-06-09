import Link from "next/link";
import { listReviewQueue } from "@/lib/modules/website";

export const dynamic = "force-dynamic";

export default async function AdminWebsitesPage() {
  const queue = await listReviewQueue();

  return (
    <div>
      <h1 className="font-display text-2xl text-stone-900">Websites — review queue</h1>
      <p className="mt-1 text-sm text-stone-500">Generated drafts awaiting approval before publish.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Generated</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {queue.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-stone-400">
                  Nothing to review. Drafts appear here after a client generates a website.
                </td>
              </tr>
            )}
            {queue.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium text-stone-900">{v.website.client.businessName}</td>
                <td className="px-4 py-3 text-stone-600">v{v.version}</td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-500">{v.createdAt.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/websites/${v.id}`} className="font-medium text-amber-700 hover:underline">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
