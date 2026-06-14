import { Wand2, Eye, Rocket, MessageSquareHeart, ExternalLink, Globe } from "lucide-react";
import { getClientWebsite, getLatestJobStatus } from "@/lib/modules/website";
import { getClientWorkspace } from "@/lib/modules/client";
import { prisma } from "@/lib/db";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";
import { RegenerateSection } from "@/components/client/RegenerateSection";
import { ClientWebsiteChanges } from "@/components/client/ClientWebsiteChanges";
import { FeatureCards } from "@/components/client/FeatureCards";
import { LogoMark } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

const VERSION_STATUS: Record<string, { label: string; tone: string; note: string }> = {
  PREVIEW: { label: "Preview ready", tone: "bg-amber-100 text-amber-800", note: "Your free preview is ready. Review it below, then approve & launch from your dashboard." },
  PUBLISHED: { label: "Published", tone: "bg-green-100 text-green-800", note: "Your website is live." },
  DRAFT: { label: "Draft", tone: "bg-stone-100 text-stone-600", note: "Draft saved." },
  ARCHIVED: { label: "Archived", tone: "bg-stone-100 text-stone-600", note: "" },
};

const STEPS = [
  { icon: Wand2, title: "Tell us about you", desc: "Share your business, style, and goals — a couple of minutes." },
  { icon: MessageSquareHeart, title: "We build it", desc: "Our team crafts your site and a free preview to review." },
  { icon: Rocket, title: "Review & launch", desc: "Request tweaks, then approve and go live in one click." },
];

export default async function ClientWebsitePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  const [website, job, contactRow] = await Promise.all([
    getClientWebsite(ws.client.id),
    getLatestJobStatus(ws.client.id),
    prisma.client.findUnique({ where: { id: ws.client.id }, select: { ownerEmail: true, ownerPhone: true } }),
  ]);
  const contactDefaults = { email: contactRow?.ownerEmail ?? ws.email, phone: contactRow?.ownerPhone ?? undefined };
  const latest = website?.versions[0];
  const copy = (latest?.config?.copy ?? null) as unknown as { heroHeadline?: string; heroSubheadline?: string } | null;
  const status = latest ? VERSION_STATUS[latest.status] ?? null : null;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  const liveUrl = website?.subdomain ? `${proto}://${website.subdomain}.${root}` : null;
  const isPublished = website?.status === "published";

  const viewable = ws.preview.viewable;
  const reviewing = ws.preview.reviewing;
  const jobActive = job?.status === "QUEUED" || job?.status === "GENERATING";
  const awaitingSetup = !isPublished && !viewable && (Boolean(latest) || jobActive);
  const firstTime = !awaitingSetup && !latest && !isPublished;
  const isOwner = ws.role === "owner";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Your website</h1>
          <p className="mt-1 text-stone-500">Tell us about your business and we&apos;ll build your site.</p>
        </div>
        {status && !awaitingSetup && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        )}
      </div>

      {/* Setting up — animated holding state */}
      {awaitingSetup && (
        <div className="anim-rise mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
          <div className="flex items-start gap-4">
            <span className="pulse-dot mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-sm"><LogoMark size={32} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl text-stone-900">We&apos;re building your website</p>
              <p className="mt-1 text-sm text-stone-600">
                Our team is putting your site together. This usually takes a few hours (up to 48). Nothing else to do
                right now — we&apos;ll have a preview ready for you to review. Feel free to check back later.
              </p>
              {/* indeterminate shimmer progress */}
              <div className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-amber-200/60">
                <div className="skeleton h-full w-1/2 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current draft / live */}
      {!awaitingSetup && latest && status && (
        <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Current draft · v{latest.version}</p>
          {copy?.heroHeadline && <p className="mt-3 font-display text-2xl text-stone-900">{copy.heroHeadline}</p>}
          {copy?.heroSubheadline && <p className="mt-1 text-stone-600">{copy.heroSubheadline}</p>}

          {!isPublished && viewable && (
            <div className="mt-4">
              <a href="/preview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
                <Eye size={16} /> View your preview
              </a>
              {reviewing && (
                <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  Your review comments are received — our team is on it (about a 48-hour turnaround). You can still view
                  your current preview above in the meantime.
                </p>
              )}
            </div>
          )}

          {liveUrl && isPublished && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-stone-500">
              <Globe size={14} /> Address:{" "}
              <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline">
                {liveUrl.replace(/^https?:\/\//, "")} <ExternalLink size={12} />
              </a>
            </p>
          )}
          {status.note && !reviewing && <p className="mt-3 text-sm text-stone-600">{status.note}</p>}
        </div>
      )}

      {/* How it works — first-time only */}
      {firstTime && isOwner && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="anim-rise rounded-2xl border border-stone-200 bg-white p-5" style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><s.icon size={18} /></span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-xs font-bold text-white">{i + 1}</span>
              </div>
              <p className="mt-3 font-semibold text-stone-900">{s.title}</p>
              <p className="mt-1 text-sm text-stone-500">{s.desc}</p>
            </div>
          ))}
        </div>
      )}

      {!awaitingSetup && isOwner &&
        (isPublished ? (
          <ClientWebsiteChanges
            quota={ws.quota}
            planName={ws.planName}
            maxPages={ws.caps.maxPages}
            canBook={ws.caps.booking && ws.choices.booking === true}
            canUseForms={ws.caps.forms}
          />
        ) : latest ? (
          <RegenerateSection
            maxPages={ws.caps.maxPages}
            canBook={ws.caps.booking && ws.choices.booking === true}
            canUseForms={ws.caps.forms}
          />
        ) : (
          <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6" style={{ "--d": "210ms" } as React.CSSProperties}>
            <h2 className="flex items-center gap-2 font-display text-xl text-stone-900"><Wand2 size={20} className="text-amber-500" /> Generate your website</h2>
            <p className="mt-1 text-sm text-stone-500">A few details is all we need to start.</p>
            <div className="mt-6">
              <WebsiteIntakeForm
                submitLabel="Generate my website"
                maxPages={ws.caps.maxPages}
                canBook={ws.caps.booking && ws.choices.booking === true}
                canUseForms={ws.caps.forms}
                contactDefaults={contactDefaults}
              />
            </div>
          </div>
        ))}

      {/* Staff see status only — website creation & changes are owner-only. */}
      {!awaitingSetup && !isOwner && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-600">
          {firstTime
            ? "Your website hasn't been set up yet. Your account owner can create it from here."
            : "Only the account owner can request website changes or regenerate the site."}
        </div>
      )}

      {!awaitingSetup && latest && isOwner && (
        <div className="mt-10">
          <FeatureCards features={ws.features} title="Add features" />
        </div>
      )}
    </div>
  );
}
