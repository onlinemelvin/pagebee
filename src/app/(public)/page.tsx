import Link from "next/link";
import { CalendarCheck, MessageSquare, CreditCard, Bot, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/ContactForm";
import { PLANS } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";

const FEATURES = [
  { icon: Search, title: "Found on Google", body: "Fast, SEO-ready sites with your hours, services, and maps wired in." },
  { icon: CalendarCheck, title: "Booking built in", body: "Let customers schedule appointments without the phone tag." },
  { icon: MessageSquare, title: "Chat & lead capture", body: "Every inquiry lands in one inbox — and you get notified instantly." },
  { icon: CreditCard, title: "Payments & invoices", body: "Send invoices, take card payments, and get paid faster." },
  { icon: Bot, title: "AI follow-ups", body: "An assistant that answers questions and chases leads for you." },
  { icon: ShieldCheck, title: "Done for you", body: "Hosting, SSL, updates, and monitoring — all handled, nothing to manage." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #1c1917 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              For local businesses
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight text-stone-900 sm:text-6xl">
              Professional websites,{" "}
              <span className="text-amber-500">built and run for you.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-stone-600">
              PageBee designs, hosts, maintains, and automates your website — with booking, chat,
              payments, and AI follow-up. All the tools of a big agency, without the bill.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/#contact">
                <Button size="lg">Book a free consultation</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg">See pricing</Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-stone-500">
              From {formatUsd(PLANS[0].monthlyFee)}/mo + {formatUsd(PLANS[0].setupFee)} setup. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl tracking-tight text-stone-900">
            Everything your business needs online
          </h2>
          <p className="mt-3 max-w-2xl text-stone-600">
            One platform handles your site and the busywork behind it — so you can get back to the work.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-stone-200 bg-[var(--background)] p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="mt-2 text-sm text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan teaser */}
      <section className="border-t border-stone-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl border border-stone-200 bg-white p-6 text-center"
              >
                <p className="font-display text-xl text-stone-900">{plan.label}</p>
                <p className="mt-3 text-3xl font-semibold text-stone-900">
                  {formatUsd(plan.monthlyFee)}
                  <span className="text-base font-normal text-stone-500">/mo</span>
                </p>
                <p className="mt-1 text-sm text-stone-500">+ {formatUsd(plan.setupFee)} setup</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/pricing">
              <Button variant="dark" size="lg">Compare plans</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl tracking-tight text-stone-900">
              Let&apos;s get your business online
            </h2>
            <p className="mt-4 max-w-md text-stone-600">
              Tell us a little about what you do. We&apos;ll put together a plan and a free, no-pressure
              consultation — usually within one business day.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-stone-600">
              <li className="flex items-center gap-3"><span className="text-amber-500">✓</span> No long-term contracts</li>
              <li className="flex items-center gap-3"><span className="text-amber-500">✓</span> Live preview before you pay</li>
              <li className="flex items-center gap-3"><span className="text-amber-500">✓</span> We handle the tech, you run the business</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-[var(--background)] p-6 sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
