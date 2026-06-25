"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, CheckCircle2, CreditCard } from "lucide-react";
import { BillingCardStep } from "@/components/client/BillingCardStep";

/**
 * Payment step of launch: the customer lands here from the launch summary ("Next — add payment").
 * Collects the setup fee + first month via our embedded Payment Element and SAVES the card on file
 * for monthly billing (BillingCardStep's setup flow uses save_default_payment_method). On success we
 * send them to the launch confirmation, which reconciles + publishes.
 */
export default function LaunchPaymentPage() {
  const router = useRouter();
  const [done, setDone] = React.useState(false);

  function onResolved(result: "applied" | "requested") {
    if (result === "applied") {
      setDone(true);
      setTimeout(() => router.push("/client/launch?checkout=success"), 1200);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col px-6 py-12">
      <Link href="/client/launch" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> Back to summary
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><CreditCard size={24} /></span>
        <div>
          <h1 className="font-display text-2xl text-stone-900">Add your payment details</h1>
          <p className="text-sm text-stone-500">Pay the setup fee + your first month to launch.</p>
        </div>
      </div>

      {done ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-card">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="mt-3 font-display text-xl text-stone-900">Payment received — launching!</p>
          <p className="mt-1 text-sm text-stone-600">Taking you to your launch confirmation…</p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <BillingCardStep flow="setup" onResolved={onResolved} />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-stone-400">
            <ShieldCheck size={13} /> Your card is saved securely (by Stripe) for your monthly subscription.
          </p>
        </div>
      )}
    </div>
  );
}
