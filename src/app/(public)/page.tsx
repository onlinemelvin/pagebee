import Link from "next/link";
import {
  CalendarCheck,
  MessageSquare,
  CreditCard,
  Bot,
  Search,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Check,
  Star,
  Wand2,
  Rocket,
  MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Reveal } from "@/components/marketing/Reveal";
import { PLANS } from "@/lib/plans";
import { formatUsd, cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Search,
    title: "Found on Google",
    body: "Fast, SEO-ready sites with your hours, services, and maps wired in from day one.",
    span: "lg:col-span-2",
    accent: "from-amber-200/70 to-orange-100/40",
  },
  {
    icon: CalendarCheck,
    title: "Booking built in",
    body: "Customers schedule appointments themselves — no more phone tag.",
    span: "",
    accent: "from-rose-200/60 to-amber-100/40",
  },
  {
    icon: MessageSquare,
    title: "Chat & lead capture",
    body: "Every inquiry lands in one inbox, and you're notified instantly.",
    span: "",
    accent: "from-amber-200/60 to-yellow-100/40",
  },
  {
    icon: CreditCard,
    title: "Payments & invoices",
    body: "Send invoices, take card payments, and get paid faster.",
    span: "",
    accent: "from-orange-200/60 to-amber-100/40",
  },
  {
    icon: Bot,
    title: "AI follow-ups",
    body: "An assistant that answers questions and chases leads while you work.",
    span: "lg:col-span-2",
    accent: "from-amber-200/70 to-rose-100/40",
  },
];

const INDUSTRIES = [
  "Cleaning services",
  "Salons & spas",
  "Plumbers",
  "Dentists",
  "Landscapers",
  "Cafés",
  "Photographers",
  "Personal trainers",
  "Electricians",
  "Auto detailing",
  "Law firms",
  "Real estate",
];

const STEPS = [
  {
    icon: Wand2,
    title: "We build your preview",
    body: "Tell us about your business and our AI builds a real preview of your new site — free.",
  },
  {
    icon: MousePointerClick,
    title: "You approve it",
    body: "Love the direction? Request a tweak, then approve. Only then do you pay the setup fee.",
  },
  {
    icon: Rocket,
    title: "We launch & run it",
    body: "We connect your domain, switch on your features, and handle hosting, updates, and monitoring.",
  },
];

const STATS = [
  { value: "24h", label: "to your first preview" },
  { value: "$0", label: "to start — no card" },
  { value: "100%", label: "done-for-you" },
];

export default function HomePage() {
  return (
    <>
      {/* ===================== Hero ===================== */}
      <section className="relative overflow-hidden">
        {/* Animated aurora mesh */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora-blob -left-24 -top-24 h-[26rem] w-[26rem] bg-amber-300" style={{ animationDelay: "0s" }} />
          <div className="aurora-blob right-[-6rem] top-10 h-[22rem] w-[22rem] bg-orange-300" style={{ animationDelay: "-6s" }} />
          <div className="aurora-blob bottom-[-8rem] left-1/3 h-[24rem] w-[24rem] bg-rose-200" style={{ animationDelay: "-12s" }} />
        </div>
        {/* Dot grid */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #1c1917 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <Reveal as="span" className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-800 backdrop-blur">
              <Sparkles size={13} className="text-amber-500" />
              Free AI preview before you pay
            </Reveal>
            <Reveal as="h1" delay={60} className="mt-6 font-display text-5xl leading-[1.04] tracking-tight text-stone-900 sm:text-6xl">
              Professional websites,{" "}
              <span className="text-gradient">built and run for you.</span>
            </Reveal>
            <Reveal as="p" delay={120} className="mt-6 max-w-xl text-lg text-stone-600">
              PageBee designs, hosts, maintains, and automates your website — with booking, chat,
              payments, and AI follow-up. All the tools of a big agency, without the bill.
            </Reveal>
            <Reveal delay={180} className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/register">
                <Button size="lg" className="group">
                  Get my free preview
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg">See pricing</Button>
              </Link>
            </Reveal>
            <Reveal delay={240} className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-500">
              <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-amber-500" /> No credit card to start</span>
              <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-amber-500" /> Cancel anytime</span>
            </Reveal>

            <Reveal delay={300} className="mt-10 flex max-w-md items-center gap-8">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="font-display text-3xl text-stone-900">{s.value}</div>
                  <div className="mt-0.5 text-xs text-stone-500">{s.label}</div>
                </div>
              ))}
            </Reveal>
          </div>

          {/* Browser-preview visual */}
          <Reveal delay={200} className="relative">
            <div className="lift relative rounded-2xl border border-stone-200/80 bg-white/80 shadow-xl shadow-amber-100/50 backdrop-blur">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-rose-300" />
                <span className="h-3 w-3 rounded-full bg-amber-300" />
                <span className="h-3 w-3 rounded-full bg-emerald-300" />
                <span className="ml-3 flex-1 truncate rounded-md bg-stone-100 px-3 py-1 text-xs text-stone-400">
                  sparklecleaningco.com
                </span>
              </div>
              {/* Faux site */}
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-24 rounded-full bg-stone-300" />
                  <div className="flex gap-2">
                    <div className="h-3 w-10 rounded-full bg-stone-200" />
                    <div className="h-3 w-10 rounded-full bg-stone-200" />
                    <div className="h-6 w-16 rounded-full bg-amber-400" />
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 p-5">
                  <div className="h-3 w-3/5 rounded-full bg-stone-700/70" />
                  <div className="mt-2 h-3 w-2/5 rounded-full bg-stone-700/40" />
                  <div className="mt-4 h-7 w-28 rounded-full bg-stone-900" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                      <div className="h-6 w-6 rounded-md bg-amber-200" />
                      <div className="mt-2 h-2 w-full rounded-full bg-stone-200" />
                      <div className="mt-1.5 h-2 w-2/3 rounded-full bg-stone-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating feature chips */}
            <div className="animate-float absolute -left-5 top-16 hidden rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-lg sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-1s" }}>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-600"><CalendarCheck size={15} /></span>
              <span className="text-xs font-semibold text-stone-700">New booking</span>
            </div>
            <div className="animate-float absolute -right-4 bottom-20 hidden rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-lg sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-3.5s" }}>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-600"><CreditCard size={15} /></span>
              <span className="text-xs font-semibold text-stone-700">Paid $240</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== Industry marquee ===================== */}
      <section className="border-y border-stone-200 bg-white/60 py-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-stone-400">
          Built for local businesses like yours
        </p>
        <div className="marquee-mask mt-5 overflow-hidden">
          <div className="marquee-track gap-3">
            {[...INDUSTRIES, ...INDUSTRIES].map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="rounded-full border border-stone-200 bg-[var(--background)] px-4 py-2 text-sm font-medium text-stone-600"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Features (bento) ===================== */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="max-w-2xl">
            <h2 className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Everything your business needs online
            </h2>
            <p className="mt-3 text-stone-600">
              One platform handles your site and the busywork behind it — so you can get back to the work.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body, span, accent }, i) => (
              <Reveal
                key={title}
                delay={i * 70}
                className={cn(
                  "lift group relative overflow-hidden rounded-3xl border border-stone-200 bg-[var(--background)] p-6",
                  span,
                )}
              >
                <div className={cn("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100", accent)} />
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/60">
                  <Icon size={22} />
                </span>
                <h3 className="relative mt-5 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
              </Reveal>
            ))}

            {/* "Done for you" highlight tile */}
            <Reveal
              delay={FEATURES.length * 70}
              className="lift relative overflow-hidden rounded-3xl bg-stone-900 p-6 text-stone-50"
            >
              <div className="aurora-blob -right-10 -top-10 h-40 w-40 bg-amber-400/40" />
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/20 text-amber-300 ring-1 ring-amber-300/30">
                <ShieldCheck size={22} />
              </span>
              <h3 className="relative mt-5 text-lg font-semibold">Completely done for you</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-stone-300">
                Hosting, SSL, updates, and monitoring — all handled. Nothing for you to manage.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== How it works ===================== */}
      <section className="border-t border-stone-200">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Preview before you pay
            </span>
            <h2 className="mt-5 font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Live in three simple steps
            </h2>
            <p className="mt-3 text-stone-600">
              No upfront risk. You see your website first — and only pay when you&apos;re ready to launch.
            </p>
          </Reveal>

          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            {/* connector line */}
            <div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent md:block" />
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 100} className="relative text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-200 bg-white text-amber-600 shadow-sm">
                  <Icon size={24} />
                </div>
                <div className="mx-auto mt-4 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-600">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Plan teaser ===================== */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="text-center">
            <h2 className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Simple plans that grow with you
            </h2>
            <p className="mt-3 text-stone-600">Start small, upgrade anytime. Every plan is fully managed.</p>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal
                key={plan.name}
                delay={i * 80}
                className={cn(
                  "lift relative overflow-hidden rounded-3xl border bg-[var(--background)] p-6 text-center",
                  plan.recommended ? "border-amber-400 shadow-lg shadow-amber-100" : "border-stone-200",
                )}
              >
                {plan.recommended && (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-bold text-stone-950">
                    <Star size={11} className="fill-stone-950" /> Popular
                  </span>
                )}
                <p className="font-display text-xl text-stone-900">{plan.label}</p>
                <p className="mt-4 font-display text-4xl text-stone-900">
                  {formatUsd(plan.monthlyFee)}
                  <span className="text-base font-normal text-stone-500">/mo</span>
                </p>
                <p className="mt-1 text-sm text-stone-500">+ {formatUsd(plan.setupFee)} one-time setup</p>
                <Link href={`/register?plan=${plan.name}`} className="mt-6 block">
                  <Button variant={plan.recommended ? "primary" : "outline"} className="w-full">
                    Choose {plan.label}
                  </Button>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline">
              Compare all features <ArrowRight size={15} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ===================== CTA band ===================== */}
      <section className="relative overflow-hidden border-t border-stone-200">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora-blob left-10 top-0 h-72 w-72 bg-amber-300" />
          <div className="aurora-blob bottom-0 right-10 h-72 w-72 bg-rose-200" style={{ animationDelay: "-9s" }} />
        </div>
        <Reveal className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="font-display text-4xl tracking-tight text-stone-900 sm:text-5xl">
            See your new website — <span className="text-gradient">free.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
            Tell us about your business and we&apos;ll build a real preview. No credit card, no pressure.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="group">
                Get my free preview
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/#contact">
              <Button variant="dark" size="lg">Talk to us</Button>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ===================== Contact ===================== */}
      <section id="contact" className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Let&apos;s get your business online
            </h2>
            <p className="mt-4 max-w-md text-stone-600">
              Tell us a little about what you do. We&apos;ll put together a plan and a free, no-pressure
              consultation — usually within one business day.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-stone-600">
              {[
                "No long-term contracts",
                "Free preview before you pay",
                "We handle the tech, you run the business",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-amber-600">
                    <Check size={13} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="rounded-3xl border border-stone-200 bg-[var(--background)] p-6 sm:p-8">
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
