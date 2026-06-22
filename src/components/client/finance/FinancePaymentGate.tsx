import Link from "next/link";
import { Wallet, Sparkles, CreditCard, ShieldCheck, ArrowRight, Check, Clock } from "lucide-react";

/**
 * Finance onboarding gate. Before an owner can use any Finance feature they must enable a way to get
 * paid — so when no payment processor is connected, this welcome screen replaces the rest of the
 * Finance tab and offers the two live options (PageBee Pay, or bring-your-own Stripe). More
 * processors (PayPal, etc.) are flagged as coming soon. Rendered by the invoices route layout.
 */
export function FinancePaymentGate({ configured }: { configured: boolean }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Wallet size={28} />
        </span>
        <h1 className="mt-4 font-display text-3xl text-stone-900">Set up payments to use Finance</h1>
        <p className="mx-auto mt-2 max-w-xl text-stone-500">
          To send invoices and get paid, first choose how you&apos;ll accept card payments. Pick one to
          continue — you can change it later.
        </p>
      </div>

      {!configured ? (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">
          Online payments are being set up for your account — please check back shortly.
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {/* PageBee Pay — the managed, white-label default. */}
          <div className="flex flex-col rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-white to-amber-50/50 p-6 shadow-card">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-amber-300"><Sparkles size={18} /></span>
              <h2 className="font-display text-lg text-stone-900">PageBee Pay</h2>
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Recommended</span>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              Fully managed card payments — we handle setup, security, and payouts to your bank. No Stripe
              account needed.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
              {["Activate in a few minutes", "Customers pay invoices by card", "Money lands in your bank"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-amber-500" /> {t}</li>
              ))}
            </ul>
            <Link
              href="/client/invoices/payments"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
            >
              Activate PageBee Pay <ArrowRight size={16} />
            </Link>
          </div>

          {/* Bring your own Stripe (Connect Standard via OAuth). */}
          <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-100 text-indigo-600"><CreditCard size={18} /></span>
              <h2 className="font-display text-lg text-stone-900">Bring your own Stripe</h2>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              Already have a Stripe account? Connect it and keep your existing payouts and history.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
              {["Use your existing Stripe", "Connect in one click", "Your payouts, your account"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-stone-400" /> {t}</li>
              ))}
            </ul>
            {/* GET endpoint → redirects to Stripe OAuth (owner-gated server-side). */}
            <a
              href="/api/v1/client/payments/connect"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              Connect Stripe <ArrowRight size={16} />
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-stone-400">
        <Clock size={14} /> <span>More ways to get paid are coming soon — PayPal and other processors.</span>
      </div>
      <p className="mt-4 flex w-full items-center justify-center gap-1.5 text-center text-xs text-stone-400">
        <ShieldCheck size={13} /> No card or bank details are ever stored on PageBee.
      </p>
    </div>
  );
}
