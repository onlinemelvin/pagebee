import Link from "next/link";
import {
  ArrowRight, CalendarCheck, CreditCard, Globe, Image as ImageIcon, Inbox,
  MessageSquare, Sparkles, Wand2, type LucideIcon,
} from "lucide-react";
import { DemoVideo } from "./DemoVideo";

interface WelcomeProps {
  ownerName: string;
  businessName: string;
  planName: string;
  isOwner: boolean;
  settingUp: boolean;
  caps: { forms: boolean; booking: boolean; invoices: boolean; ai: boolean };
}

const STEPS = [
  { n: 1, title: "Tell us about your business", desc: "A few quick questions — your trade, services, and style." },
  { n: 2, title: "We generate your preview", desc: "Our AI builds a full site you can review, usually in minutes." },
  { n: 3, title: "Review & launch", desc: "Request changes, then go live. You only pay once you love it." },
];

/**
 * Pre-site landing for the client dashboard. Until the first preview is generated there's no data
 * to show, so the normal dashboard (stats, charts, inquiries) is replaced entirely by this screen:
 * it explains the product, plays a demo, and drives the one action that matters — create the site.
 */
export function CreateSiteWelcome({ ownerName, businessName, planName, isOwner, settingUp, caps }: WelcomeProps) {
  // What this client will eventually manage from here — shown as a teaser so they know where things
  // will live once the site exists. Plan-aware: only surface capabilities they actually have.
  const tour: { icon: LucideIcon; title: string; desc: string }[] = [
    { icon: Globe, title: "Your website", desc: "Edit copy, photos, and pages anytime — changes go live after a quick review." },
    { icon: Inbox, title: "Inquiries", desc: "Messages from your site's contact form land in one tidy inbox." },
    ...(caps.booking ? [{ icon: CalendarCheck, title: "Appointments", desc: "Let customers book you online and manage your calendar." }] : []),
    ...(caps.invoices ? [{ icon: CreditCard, title: "Invoices & payments", desc: "Send invoices and get paid by card, all from your dashboard." }] : []),
    ...(caps.ai ? [{ icon: MessageSquare, title: "AI assistant", desc: "An AI chat answers visitors and follows up with leads for you." }] : []),
    { icon: ImageIcon, title: "Media library", desc: "Upload and organize the photos that show off your work." },
  ];

  return (
    <div className="space-y-10">
      {/* ── Hero ── */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            <Sparkles size={13} /> Welcome to PageBee · {planName} plan
          </span>
          <h1 className="mt-4 font-display text-4xl leading-tight text-stone-900 sm:text-5xl">
            {settingUp ? (
              <>We&apos;re building {businessName}&apos;s website</>
            ) : (
              <>Let&apos;s get {businessName} online, {ownerName}.</>
            )}
          </h1>
          <p className="mt-4 max-w-md text-lg text-stone-600">
            {settingUp
              ? "Your preview is being generated — this can take up to 48 hours, but it's usually just a few minutes. We'll have it ready for you to review."
              : "Answer a few questions and we'll generate a complete, professional website for you to review. Your dashboard fills in with everything else once it's live."}
          </p>

          {isOwner && !settingUp && (
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                href="/client/website"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-base font-semibold text-stone-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-lg motion-reduce:transform-none"
              >
                <Wand2 size={18} /> Create my website
              </Link>
              <span className="text-sm text-stone-500">Free preview — no card required.</span>
            </div>
          )}

          {settingUp && (
            <div className="mt-7">
              <Link
                href="/client/website"
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-base font-semibold text-stone-800 transition hover:border-amber-300 hover:bg-amber-50"
              >
                View status <ArrowRight size={17} />
              </Link>
            </div>
          )}

          {!isOwner && !settingUp && (
            <p className="mt-7 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Your account owner hasn&apos;t created the website yet. Once it&apos;s live, your tools will show up here.
            </p>
          )}
        </div>

        <DemoVideo url={process.env.NEXT_PUBLIC_DEMO_VIDEO_URL} />
      </section>

      {/* ── How it works ── */}
      {!settingUp && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">How it works</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 font-display text-base font-semibold text-amber-700">
                  {s.n}
                </span>
                <p className="mt-3 font-medium text-stone-900">{s.title}</p>
                <p className="mt-1 text-sm text-stone-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── What you&apos;ll manage here ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">What you&apos;ll manage here</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tour.map((t) => (
            <div key={t.title} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <t.icon size={20} />
              </span>
              <p className="mt-3 font-medium text-stone-900">{t.title}</p>
              <p className="mt-1 text-sm text-stone-600">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
