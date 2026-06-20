import { Wand2, Eye, Rocket, MessageSquareHeart, ExternalLink } from "lucide-react";
import { getClientWebsite, getLatestJobStatus, getDomainState, isDomainBuyDryRun } from "@/lib/modules/website";
import { CustomDomainPanel } from "@/components/client/CustomDomainPanel";
import { getClientWorkspace } from "@/lib/modules/client";
import { isDomainDryRunEligible } from "@/lib/auth/policy";
import { prisma } from "@/lib/db";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";
import { RegenerateSection } from "@/components/client/RegenerateSection";
import { ClientWebsiteChanges } from "@/components/client/ClientWebsiteChanges";
import { FeatureCards } from "@/components/client/FeatureCards";
import { ApproveLaunchButton } from "@/components/client/ApproveLaunchButton";
import { CheckoutButton } from "@/components/client/BillingActions";
import { PreviewCover } from "@/components/client/PreviewCover";
import { extractAccentColor } from "@/lib/site/accent";
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
  // Test-only domain "dry-run" toggle — eligibility decided ONLY here on the server (by email), so
  // the capability never reaches a real customer's page. Its on/off state lives in a server flag.
  const dryRunEligible = ws.caps.customDomain && isDomainDryRunEligible(ws.email);
  const [website, job, contactRow, domainState, dryRunEnabled] = await Promise.all([
    getClientWebsite(ws.client.id),
    getLatestJobStatus(ws.client.id),
    prisma.client.findUnique({ where: { id: ws.client.id }, select: { ownerEmail: true, ownerPhone: true } }),
    ws.caps.customDomain ? getDomainState(ws.client.id) : Promise.resolve(null),
    dryRunEligible ? isDomainBuyDryRun(ws.client.id) : Promise.resolve(false),
  ]);
  const contactDefaults = { email: contactRow?.ownerEmail ?? ws.email, phone: contactRow?.ownerPhone ?? undefined };
  const latest = website?.versions[0];
  const copy = (latest?.config?.copy ?? null) as unknown as { heroHeadline?: string; heroSubheadline?: string } | null;
  // Real brand color from the generated HTML — config.theme is generated separately and unreliable.
  const accent = extractAccentColor(latest?.generatedHtml) ?? "#f59e0b";
  const status = latest ? VERSION_STATUS[latest.status] ?? null : null;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  const liveUrl = website?.subdomain ? `${proto}://${website.subdomain}.${root}` : null;
  const isPublished = website?.status === "published";

  const viewable = ws.preview.viewable;
  const reviewing = ws.preview.reviewing;
  // Clicking the cover opens the (released) preview when there is one — the initial preview or a
  // pending update — otherwise the live site once published.
  const coverHref = viewable ? "/preview" : isPublished && liveUrl ? liveUrl : undefined;
  const jobActive = job?.status === "QUEUED" || job?.status === "GENERATING";
  // The owner approved their preview but the one-time setup fee is still due — show a pay-to-launch
  // CTA, not the generic "we're building" card (which would look like nothing happened on approve).
  const awaitingPayment = ws.preview.awaitingPayment;
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
        {status && !awaitingSetup && !awaitingPayment && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        )}
      </div>

      {/* Approved, setup fee due — pay to launch. Priority state: shows whenever payment is pending,
          even though the approved preview is still viewable (releasedExists makes `viewable` true). */}
      {awaitingPayment && (
        <div className="anim-rise mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-card">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-600 shadow-sm"><Rocket size={28} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl text-stone-900">One step left — pay to launch</p>
              <p className="mt-1 text-sm text-stone-600">
                Your preview is approved. Pay the one-time setup fee and your first month to go live — your site
                publishes, your domain connects, and your features turn on right away.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <CheckoutButton kind="setup" label="Pay &amp; launch your site" />
                <a href="/client/billing" className="text-sm font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
                  Billing details
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setting up — animated holding state (genuinely generating, not a payment hold) */}
      {awaitingSetup && !awaitingPayment && (
        <div className="anim-rise mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-card">
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

      {/* Current draft / live — also shown while awaiting payment, so the owner sees their approved
          site below the pay CTA (the regenerate form and any live/published notes stay hidden). */}
      {!awaitingSetup && latest && status && (
        <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Lightweight preview cover (branded thumbnail, not a live render) */}
            <div className="w-full shrink-0 sm:w-60">
              <PreviewCover businessName={ws.client.businessName} accent={accent} copy={copy} href={coverHref} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                {isPublished
                  ? viewable
                    ? "Pending update"
                    : ws.preview.updateInReview
                      ? "Update in progress"
                      : "Your website"
                  : awaitingPayment
                    ? "Approved — ready to launch"
                    : "Current draft"}{" "}
                · v{latest.version}
              </p>
              {copy?.heroHeadline && <p className="mt-2 font-display text-2xl text-stone-900">{copy.heroHeadline}</p>}
              {copy?.heroSubheadline && <p className="mt-1 text-stone-600">{copy.heroSubheadline}</p>}

              {/* Live site — a catchy "Live Website" tag and the clickable URL (no extra button). */}
              {isPublished && liveUrl && (
                <div className="mt-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    Live Website
                  </span>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group mt-2 flex w-fit items-center gap-1.5 text-base font-semibold text-blue-600 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-700 hover:decoration-blue-500"
                  >
                    {liveUrl.replace(/^https?:\/\//, "")}
                    <ExternalLink size={14} className="text-blue-500 transition group-hover:text-blue-600" />
                  </a>
                </div>
              )}

              {/* Preview — the initial preview, OR a released pending update to the live site. */}
              {viewable && (
                <div className={isPublished ? "mt-4 border-t border-stone-100 pt-4" : "mt-4"}>
                  {isPublished && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                      You have changes ready to review
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <a href="/preview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
                      <Eye size={16} /> {isPublished ? "View new preview" : "View your preview"}
                    </a>
                    {ws.preview.ready && isOwner && <ApproveLaunchButton isUpdate={isPublished} />}
                  </div>
                  {reviewing && (
                    <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                      Your review comments are received — our team is on it (about a 48-hour turnaround). You can still view
                      your current preview above in the meantime.
                    </p>
                  )}
                </div>
              )}

              {/* A requested change is being prepared — the live site stays up until it's ready to review. */}
              {isPublished && ws.preview.updateInReview && !viewable && (
                <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  We&apos;re preparing your requested changes — your live site stays up in the meantime. You&apos;ll be
                  able to review the new version here shortly.
                </p>
              )}
              {status.note && !reviewing && !isPublished && !awaitingPayment && <p className="mt-3 text-sm text-stone-600">{status.note}</p>}
            </div>
          </div>
        </div>
      )}

      {/* How it works — first-time only */}
      {firstTime && isOwner && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="anim-rise rounded-2xl border border-stone-200 bg-white p-5 shadow-card" style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
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

      {!awaitingSetup && !awaitingPayment && isOwner &&
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
          <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card" style={{ "--d": "210ms" } as React.CSSProperties}>
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
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-600 shadow-card">
          {firstTime
            ? "Your website hasn't been set up yet. Your account owner can create it from here."
            : "Only the account owner can request website changes or regenerate the site."}
        </div>
      )}

      {/* Custom domain — owners on a plan that includes it, once a site exists. */}
      {!awaitingSetup && latest && isOwner && ws.caps.customDomain && (
        <CustomDomainPanel initial={domainState} dryRunEligible={dryRunEligible} dryRunEnabled={dryRunEnabled} />
      )}

      {!awaitingSetup && latest && isOwner && (
        <div className="mt-10">
          <FeatureCards features={ws.features} title="Add features" />
        </div>
      )}
    </div>
  );
}
