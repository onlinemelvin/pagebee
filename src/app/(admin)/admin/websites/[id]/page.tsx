import Link from "next/link";
import { notFound } from "next/navigation";
import { getVersionDetail, listWebsiteVersions } from "@/lib/modules/website";
import { openChangeRequestCount } from "@/lib/modules/review";
import { getAuthContext, hasPermission } from "@/lib/auth/session";
import { ReleaseButton } from "@/components/admin/ReleaseButton";
import { ManualEditPanel } from "@/components/admin/ManualEditPanel";
import { RevertButton } from "@/components/admin/RevertButton";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [version, openChanges, ctx] = await Promise.all([
    getVersionDetail(id),
    openChangeRequestCount(id),
    getAuthContext(),
  ]);
  if (!version) notFound();

  const versions = await listWebsiteVersions(version.website.id);
  const latestVersionNo = versions[0]?.version ?? version.version;
  const published = version.status === "PUBLISHED";
  const released = version.config?.adminReviewed ?? false;
  // An update to an already-live site (the website is published but this draft isn't the live one).
  const isLiveUpdate = version.website.status === "published" && !published;
  const canRelease = ctx ? hasPermission(ctx, "website:review") : false;
  const apiBase = `/api/v1/admin/websites/${version.id}`;

  return (
    <div className="max-w-6xl">
      <Link href="/admin/websites" className="text-sm text-stone-500 hover:underline">
        ← Review queue
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-stone-900">{version.website.client.businessName}</h1>
          <p className="text-sm text-stone-500">
            Draft v{version.version} · {version.website.subdomain}.pagebee.com
            {openChanges > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {openChanges} open change request{openChanges === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        {canRelease ? (
          <ReleaseButton versionId={version.id} published={published} released={released} isLiveUpdate={isLiveUpdate} />
        ) : (
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-500">Read only</span>
        )}
      </div>

      {/* Read-only preview here; full review + commenting happens fullscreen (chrome-free). */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-stone-600">Preview</p>
          <a
            href={`/website-review/${version.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
          >
            Open fullscreen to review &amp; comment ↗
          </a>
        </div>
        <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <iframe src={`${apiBase}/frame`} title="Website preview" className="h-[70vh] w-full border-0 bg-white" />
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Open fullscreen to pin changes (right-click), add comments, and “Request changes &amp; regenerate”.
        </p>
      </div>

      {/* Manual fallback when AI edits aren't enough — saves as a new version. */}
      {canRelease && !published && <ManualEditPanel versionId={version.id} />}

      {/* Version history — every generation/edit/revert is its own version; revert is one click. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Version history</h2>
        <p className="mt-1 text-xs text-stone-400">
          Every generation, AI revision, manual edit, and revert is its own version. Reverting creates a new
          current version from an older one — nothing is ever lost.
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {versions.map((v) => {
                const isViewing = v.id === version.id;
                const isLatest = v.version === latestVersionNo;
                return (
                  <tr key={v.id} className={isViewing ? "bg-amber-50/60" : undefined}>
                    <td className="px-4 py-3 font-medium text-stone-900">
                      v{v.version}
                      {isLatest && (
                        <span className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                          latest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {v.status}
                      {v.config?.adminReviewed ? " · released" : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-500">{v.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-4">
                        {isViewing ? (
                          <span className="text-xs text-stone-400">viewing</span>
                        ) : (
                          <Link href={`/admin/websites/${v.id}`} className="text-xs font-medium text-amber-700 hover:underline">
                            View
                          </Link>
                        )}
                        {canRelease && !isLatest && <RevertButton versionId={v.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
