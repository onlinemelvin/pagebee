import { getClientWebsite, getLatestJobStatus } from "@/lib/modules/website";
import { getClientWorkspace } from "@/lib/modules/client";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";
import { RegenerateSection } from "@/components/client/RegenerateSection";
import { ClientUpdateRequest } from "@/components/client/ClientUpdateRequest";

export const dynamic = "force-dynamic";

const VERSION_STATUS: Record<string, { label: string; tone: string; note: string }> = {
  PREVIEW: { label: "Preview ready", tone: "bg-amber-100 text-amber-800", note: "Your free preview is ready. Review it below, then approve & launch from your dashboard." },
  PUBLISHED: { label: "Published", tone: "bg-green-100 text-green-800", note: "Your website is live." },
  DRAFT: { label: "Draft", tone: "bg-stone-100 text-stone-600", note: "Draft saved." },
  ARCHIVED: { label: "Archived", tone: "bg-stone-100 text-stone-600", note: "" },
};

export default async function ClientWebsitePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  const [website, job] = await Promise.all([
    getClientWebsite(ws.client.id),
    getLatestJobStatus(ws.client.id),
  ]);
  const latest = website?.versions[0];
  const copy = (latest?.config?.copy ?? null) as unknown as { heroHeadline?: string; heroSubheadline?: string } | null;
  const status = latest ? VERSION_STATUS[latest.status] ?? null : null;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  const liveUrl = website?.subdomain ? `${proto}://${website.subdomain}.${root}` : null;
  const isPublished = website?.status === "published";

  // The client only sees their preview once a PageBee reviewer has released it
  // (config.adminReviewed). Until then — including while it's still generating or sitting
  // in the review queue — they see a calm "we're setting up your website" holding state,
  // never the behind-the-scenes machinery.
  // A released version exists → the client can always open /preview (even while a newer revision
  // is being reviewed). Until the FIRST release they see the calm "we're setting up" holding state.
  const viewable = ws.preview.viewable;
  const reviewing = ws.preview.reviewing;
  const jobActive = job?.status === "QUEUED" || job?.status === "GENERATING";
  const awaitingSetup = !isPublished && !viewable && (Boolean(latest) || jobActive);

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Your website</h1>
      <p className="mt-1 text-stone-500">
        Tell us about your business and we&apos;ll build your site.
      </p>

      {awaitingSetup && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-lg">🐝</span>
            <div>
              <p className="font-display text-lg text-stone-900">We&apos;re setting up your website</p>
              <p className="mt-1 text-sm text-stone-600">
                Our team is putting your site together. This can take up to 48 hours, though it&apos;s usually
                ready within a few hours. There&apos;s nothing else you need to do right now — please check
                back later and we&apos;ll have your preview ready to review.
              </p>
            </div>
          </div>
        </div>
      )}

      {!awaitingSetup && latest && status && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Current draft · v{latest.version}
            </p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
          </div>
          {copy?.heroHeadline && (
            <p className="mt-3 font-display text-2xl text-stone-900">{copy.heroHeadline}</p>
          )}
          {copy?.heroSubheadline && <p className="mt-1 text-stone-600">{copy.heroSubheadline}</p>}

          {!isPublished && viewable && (
            <div className="mt-4">
              <a
                href="/preview"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300"
              >
                View your preview ↗
              </a>
              {reviewing && (
                <p className="mt-3 text-sm text-stone-600">
                  Your review comments are received — our team is reviewing them (about a 48-hour
                  turnaround). You can still view your current preview above in the meantime.
                </p>
              )}
            </div>
          )}

          {liveUrl && isPublished && (
            <p className="mt-3 text-sm text-stone-500">
              Address:{" "}
              <a href={liveUrl} target="_blank" rel="noreferrer" className="font-medium text-amber-700 hover:underline">
                {liveUrl.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
          {status.note && !reviewing && <p className="mt-3 text-sm text-stone-600">{status.note}</p>}
        </div>
      )}

      {!awaitingSetup && isPublished && (
        <ClientUpdateRequest quota={ws.quota} planName={ws.planName} />
      )}

      {!awaitingSetup &&
        (latest ? (
          // Already have a website → collapsed behind a button (don't dump the big form on them).
          <RegenerateSection
            maxPages={ws.caps.maxPages}
            canBook={ws.caps.booking && ws.choices.booking === true}
            canUseForms={ws.caps.forms}
          />
        ) : (
          // First-time generation → show the intake form directly.
          <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="font-display text-xl text-stone-900">Generate your website</h2>
            <p className="mt-1 text-sm text-stone-500">A few details is all we need to start.</p>
            <div className="mt-6">
              <WebsiteIntakeForm
                submitLabel="Generate my website"
                maxPages={ws.caps.maxPages}
                canBook={ws.caps.booking && ws.choices.booking === true}
                canUseForms={ws.caps.forms}
              />
            </div>
          </div>
        ))}
    </div>
  );
}
