import { redirect } from "next/navigation";
import { Wand2, Eye, Rocket, MessageSquareHeart, ExternalLink, CreditCard } from "lucide-react";
import { getClientWebsite, getLatestJobStatus, getDomainState } from "@/lib/modules/website";
import { DomainCard } from "@/components/client/DomainCard";
import { getClientWorkspace } from "@/lib/modules/client";
import { prisma } from "@/lib/db";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";
import { RegenerateButton } from "@/components/client/RegenerateButton";
import { ClientWebsiteChanges } from "@/components/client/ClientWebsiteChanges";
import { FeatureCards } from "@/components/client/FeatureCards";
import { ApproveLaunchButton } from "@/components/client/ApproveLaunchButton";
import { PreviewCover } from "@/components/client/PreviewCover";
import { extractAccentColor } from "@/lib/site/accent";
import { LogoMark } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Wand2, title: "Tell us about you", desc: "Share your business, style, and goals — a couple of minutes." },
  { icon: MessageSquareHeart, title: "We build it", desc: "Our team crafts your site and a free preview to review." },
  { icon: Rocket, title: "Review & launch", desc: "Request tweaks, then approve and go live in one click." },
];

export default async function ClientWebsitePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.website.view) redirect("/client"); // staff without website access

  const [website, job, contactRow, domainState] = await Promise.all([
    getClientWebsite(ws.client.id),
    getLatestJobStatus(ws.client.id),
    prisma.client.findUnique({ where: { id: ws.client.id }, select: { ownerEmail: true, ownerPhone: true } }),
    ws.caps.customDomain ? getDomainState(ws.client.id) : Promise.resolve(null),
  ]);

  const contactDefaults = { email: contactRow?.ownerEmail ?? ws.email, phone: contactRow?.ownerPhone ?? undefined };
  const latest = website?.versions[0];
  const copy = (latest?.config?.copy ?? null) as unknown as { heroHeadline?: string; heroSubheadline?: string } | null;
  const accent = extractAccentColor(latest?.generatedHtml) ?? "#f59e0b";

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  const subUrl = website?.subdomain ? `${proto}://${website.subdomain}.${root}` : null;
  // When a custom domain is connected/live, that's the address we surface everywhere (cover, links).
  const customHost = domainState?.status === "active" ? (domainState.domain ?? null) : null;
  const liveUrl = customHost ? `https://${customHost}` : subUrl;
  const addressHost = customHost ?? (website?.subdomain ? `${website.subdomain}.${root}` : null);
  const isPublished = website?.status === "published";

  const viewable = ws.preview.viewable;
  const reviewing = ws.preview.reviewing;
  const jobActive = job?.status === "QUEUED" || job?.status === "GENERATING";
  const awaitingPayment = ws.preview.awaitingPayment;
  const awaitingSetup = !isPublished && !viewable && (Boolean(latest) || jobActive);
  const firstTime = !awaitingSetup && !latest && !isPublished;
  const isOwner = ws.role === "owner";

  // Editing tools (request changes / add features / domain) appear only for a settled site the owner
  // manages — never mid-build or mid-payment, where the page should stay focused on the one next step.
  const showTools = isOwner && Boolean(latest) && !awaitingSetup && !awaitingPayment;

  const subtitle = firstTime
    ? "Tell us about your business and we'll build a free preview to review."
    : awaitingSetup
      ? "We're putting your website together — hang tight."
      : awaitingPayment
        ? "Your preview is approved — one step left to go live."
        : isPublished
          ? "Your site is live. Make changes or add features anytime."
          : "Your free preview is ready. Review it, then launch.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Your website</h1>
        <p className="mt-1 text-stone-500">{subtitle}</p>
      </div>

      {/* ───────────────── PRIMARY: the single most important state ───────────────── */}

      {/* Approved → pay to launch (focused; nothing else competes for attention) */}
      {awaitingPayment && (
        <div className="anim-rise overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-card">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-600 shadow-sm"><Rocket size={28} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl text-stone-900">One step left — pay to launch</p>
              <p className="mt-1 text-sm text-stone-600">
                Pay the one-time setup fee and your first month to go live — your site publishes, your domain connects,
                and your features turn on right away.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a href="/client/launch" className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700">
                  <CreditCard size={16} /> Continue to launch
                </a>
                <a href="/preview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
                  <Eye size={15} /> Review your preview
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Building */}
      {awaitingSetup && (
        <div className="anim-rise overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-card">
          <div className="flex items-start gap-4">
            <span className="pulse-dot mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-sm"><LogoMark size={32} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl text-stone-900">We&apos;re building your website</p>
              <p className="mt-1 text-sm text-stone-600">
                This usually takes a few hours (up to 48). Nothing to do right now — we&apos;ll have a preview ready for
                you to review. Feel free to check back later.
              </p>
              <div className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-amber-200/60">
                <div className="skeleton h-full w-1/2 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview ready (not yet launched) */}
      {!awaitingSetup && !awaitingPayment && !isPublished && latest && (
        <div className="anim-rise rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="w-full shrink-0 sm:w-56">
              <PreviewCover businessName={ws.client.businessName} accent={accent} copy={copy} href="/preview" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Preview ready</span>
              {copy?.heroHeadline && <p className="mt-2 font-display text-xl text-stone-900">{copy.heroHeadline}</p>}
              <p className="mt-1 text-sm text-stone-500">Review your free preview, then approve to go live. You only pay the setup fee + first month when you launch.</p>
              {addressHost && (
                <p className="mt-2 text-xs text-stone-400">
                  Your address: <span className="font-medium text-stone-600">{customHost ?? addressHost}</span>
                  {customHost && <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">custom domain</span>}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a href="/preview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
                  <Eye size={16} /> View your preview
                </a>
                {ws.preview.ready && isOwner && <ApproveLaunchButton isUpdate={false} />}
                {isOwner && (
                  <RegenerateButton maxPages={ws.caps.maxPages} canBook={ws.caps.booking && ws.choices.booking === true} canUseForms={ws.caps.forms} />
                )}
              </div>
              {reviewing && (
                <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  Your review comments are received — our team is on it (about a 48-hour turnaround). You can still view your current preview above in the meantime.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live site */}
      {!awaitingSetup && isPublished && latest && (
        <div className="anim-rise rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* LEFT — the live site + its address */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="w-full shrink-0 sm:w-56">
                  <PreviewCover businessName={ws.client.businessName} accent={accent} copy={copy} href={liveUrl ?? undefined} />
                </div>
                <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Live website
              </span>
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noreferrer" className="group mt-2 flex w-fit items-center gap-1.5 text-base font-semibold text-blue-600 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-700 hover:decoration-blue-500">
                  {liveUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink size={14} className="text-blue-500 transition group-hover:text-blue-600" />
                </a>
              )}

              {/* Pending update to the live site */}
              {viewable && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">Changes ready to review</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href="/preview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
                      <Eye size={16} /> View new preview
                    </a>
                    {ws.preview.ready && isOwner && <ApproveLaunchButton isUpdate />}
                  </div>
                  {reviewing && (
                    <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                      Your comments are received — our team is on it (about a 48-hour turnaround).
                    </p>
                  )}
                </div>
              )}
              {ws.preview.updateInReview && !viewable && (
                <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  We&apos;re preparing your requested changes — your live site stays up until the new version is ready to review.
                </p>
              )}
                </div>
              </div>
            </div>

            {/* RIGHT — make changes, alongside the live site */}
            {isOwner && (
              <div className="mt-5 border-t border-stone-100 pt-5 lg:mt-0 lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <ClientWebsiteChanges
                  quota={ws.quota}
                  planName={ws.planName}
                  maxPages={ws.caps.maxPages}
                  canBook={ws.caps.booking && ws.choices.booking === true}
                  canUseForms={ws.caps.forms}
                  bare
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* First time — how it works + generate */}
      {firstTime && isOwner && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="anim-rise rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
            <h2 className="flex items-center gap-2 font-display text-xl text-stone-900"><Wand2 size={20} className="text-amber-500" /> Generate your website</h2>
            <p className="mt-1 text-sm text-stone-500">A few details is all we need to start. It&apos;s free to preview.</p>
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
        </>
      )}

      {/* ───────────────── TOOLS: only for a settled site the owner manages ───────────────── */}
      {showTools && (
        /* Add features — custom domain is the first card in the grid (opens its flows in a modal). */
        <FeatureCards
          features={ws.features}
          title="Add features"
          prepend={ws.caps.customDomain ? <DomainCard initial={domainState} testModeActive={ws.testMode} /> : null}
        />
      )}

      {/* Staff (non-owner) — status only */}
      {!isOwner && !awaitingSetup && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-600 shadow-card">
          {firstTime
            ? "Your website hasn't been set up yet. Your account owner can create it from here."
            : "Only the account owner can request website changes or regenerate the site."}
        </div>
      )}
    </div>
  );
}
