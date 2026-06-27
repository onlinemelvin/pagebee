import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, Check, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "SMS Text Alerts — Opt-In",
  description:
    "How PageBee business owners opt in to receive SMS text alerts about their leads and bookings, including the consent shown at sign-up.",
};

/** Public proof-of-consent page for SMS (toll-free) verification. Reachable without
 *  login so carriers/Twilio reviewers can see the opt-in flow and consent language.
 *  Mirrors the in-app opt-in screen in components/client/SmsAlertSettings.tsx. */
export default function SmsOptInPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <MessageSquare size={20} />
        </span>
        <h1 className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">SMS text alerts</h1>
      </div>

      <p className="mt-6 text-[15px] leading-relaxed text-stone-600">
        PageBee builds and hosts websites for local businesses. Business owners who use PageBee can
        choose to receive <strong>SMS text alerts</strong> notifying them about activity on their own
        website — such as a new customer inquiry (lead) or a booking request. This page documents how
        an owner opts in and the consent they agree to, so the opt-in flow is publicly viewable.
      </p>

      {/* The opt-in story */}
      <section className="mt-12 space-y-4">
        <h2 className="font-display text-xl text-stone-900">How owners opt in</h2>
        <ol className="space-y-3">
          {[
            "The business owner signs in to their PageBee dashboard and opens Settings.",
            "Under “Text (SMS) alerts,” the owner enters their own mobile number.",
            "The owner reads the consent statement (shown below) and turns the “Text alerts” toggle on. Turning it on is the affirmative opt-in.",
            "The owner chooses which alerts they want (new inquiries, appointment requests).",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-stone-600">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Visual mock of the actual opt-in screen */}
      <section className="mt-12">
        <h2 className="font-display text-xl text-stone-900">The opt-in screen</h2>
        <p className="mt-2 text-sm text-stone-500">
          This is the consent screen shown to owners in their account settings.
        </p>

        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <MessageSquare size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-stone-900">Text (SMS) alerts</h3>
                <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-amber-500">
                  <span className="inline-block h-5 w-5 translate-x-5 transform rounded-full bg-white shadow" />
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">
                Get a text the second a new lead or booking comes in, with a link to reply in your
                dashboard. PageBee only texts you alerts you turn on — never marketing or promotions.
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-stone-100 pt-4">
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Mobile number for alerts
              <input
                disabled
                value="(555) 123-4567"
                className="max-w-xs rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-500"
              />
              <span className="text-xs text-stone-400">US &amp; Canada numbers only.</span>
            </label>

            <p className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-xs leading-relaxed text-stone-500">
              By entering your mobile number and turning on text alerts below, you agree to receive
              automated SMS text messages from PageBee notifying you of new leads and booking requests
              for your business at the number provided. Consent is not a condition of purchase. Message
              frequency varies by your activity. Message and data rates may apply. Reply{" "}
              <span className="font-semibold text-stone-600">STOP</span> to cancel or{" "}
              <span className="font-semibold text-stone-600">HELP</span> for help. We never sell or
              share your mobile number, and your opt-in is never shared with third parties. See our{" "}
              <Link href="/privacy" className="font-medium text-amber-700 underline hover:text-amber-800">Privacy Policy</Link>{" "}
              and{" "}
              <Link href="/terms" className="font-medium text-amber-700 underline hover:text-amber-800">Terms</Link>.
            </p>

            <div className="mt-4 flex items-center gap-1.5 text-xs text-stone-400">
              <Check size={13} className="text-emerald-500" />
              Turning this on confirms your consent to receive these SMS alerts. Reply STOP anytime to
              opt out, HELP for help.
            </div>
          </div>
        </div>
      </section>

      {/* Plain-language consent summary */}
      <section className="mt-12 space-y-3">
        <h2 className="font-display text-xl text-stone-900">What owners consent to</h2>
        <ul className="space-y-2 text-[15px] text-stone-600">
          {[
            "Message type: transactional account notifications (new leads and booking requests) — no marketing.",
            "Recipients: the business owner / account holder who opts in, at their own mobile number.",
            "Message frequency varies based on the business’s activity.",
            "Message and data rates may apply.",
            "Reply STOP to opt out at any time; reply HELP for help.",
            "Mobile opt-in data and consent are never sold or shared with third parties.",
          ].map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <Check size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-2xl border border-stone-200 bg-stone-50 p-6">
        <h2 className="font-display text-lg text-stone-900">Sample message</h2>
        <p className="mt-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          You&apos;ve received a new inquiry on your PageBee website. View it here:
          https://www.pagebee.com/client/inquiries · Reply STOP to opt out.
        </p>
      </section>

      <div className="mt-12 flex flex-wrap gap-4 text-sm">
        <Link href="/privacy" className="inline-flex items-center gap-1.5 font-medium text-amber-700 hover:text-amber-800">
          Privacy Policy <ArrowRight size={14} />
        </Link>
        <Link href="/terms" className="inline-flex items-center gap-1.5 font-medium text-amber-700 hover:text-amber-800">
          Terms of Service <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}
