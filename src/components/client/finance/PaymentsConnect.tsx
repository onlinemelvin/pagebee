"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Check, RefreshCw, ShieldCheck, Zap, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/modules/payments";

const PERKS = [
  { icon: Zap, text: "Customers pay invoices by card in one tap" },
  { icon: Wallet, text: "Take deposits & partial payments automatically" },
  { icon: ShieldCheck, text: "Bank-grade security & receipts — fully managed" },
];

export function PaymentsConnect({ status, notice }: { status: PaymentStatus; notice?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    setBusy(true);
    await fetch("/api/v1/client/payments/refresh", { method: "POST" }).catch(() => {});
    router.refresh();
    setBusy(false);
  }

  const fee = (status.feeBps / 100).toFixed(2);

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-amber-50/40 shadow-card">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-amber-300"><Sparkles size={18} /></span>
          <h2 className="font-display text-lg text-stone-900">PageBee Pay</h2>
          {status.chargesEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><Check size={11} /> Active</span>
          )}
        </div>

        {!status.configured ? (
          <p className="mt-3 text-sm text-stone-600">
            PageBee Pay is being set up for your account — online card payments will be available here
            shortly. Hang tight.
          </p>
        ) : status.chargesEnabled ? (
          <div className="mt-3 text-sm text-stone-600">
            <p>
              <strong className="text-stone-900">You&apos;re all set.</strong> Every invoice can now be paid by card —
              deposits, partial payments, and receipts are handled automatically. Your money lands in your
              account; PageBee keeps a flat {fee}% per payment.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>
                <RefreshCw size={14} className={cn(busy && "animate-spin")} /> Refresh status
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-stone-600">
              Get paid faster. Switch on <strong className="text-stone-900">PageBee Pay</strong> and let customers
              settle invoices by card in seconds — sophisticated, secure payments, fully managed for you.
            </p>
            <ul className="mt-3 space-y-1.5">
              {PERKS.map((p) => (
                <li key={p.text} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-700"><p.icon size={13} /></span>
                  {p.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-stone-400">Flat {fee}% per payment — no monthly fees, no setup cost. Payouts go straight to your bank.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/client/invoices/payments"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.6)] motion-reduce:transform-none"
              >
                <Sparkles size={15} /> {status.connected ? "Finish activating PageBee Pay" : "Activate PageBee Pay"}
              </Link>
              {status.connected && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>
                  <RefreshCw size={14} className={cn(busy && "animate-spin")} /> Check status
                </Button>
              )}
            </div>
            {/* Advanced: connect an existing payment account */}
            <details className="mt-3 text-xs text-stone-400">
              <summary className="cursor-pointer select-none hover:text-stone-600">Already have your own payment account?</summary>
              <a href="/api/v1/client/payments/connect?mode=BYO" className="mt-1 inline-block text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
                Connect your own account instead →
              </a>
            </details>
          </div>
        )}

        {notice === "error" && <p className="mt-2 text-sm text-red-600">Something went wrong activating PageBee Pay. Please try again.</p>}
        {notice === "tier_required" && <p className="mt-2 text-sm text-red-600">PageBee Pay is part of the Automate plan. Upgrade to switch it on.</p>}
        {notice === "done" && !status.chargesEnabled && status.connected && (
          <p className="mt-2 text-sm text-amber-700">Almost there — we&apos;re verifying your details. Click &quot;Check status&quot; in a moment.</p>
        )}
      </div>
    </section>
  );
}
