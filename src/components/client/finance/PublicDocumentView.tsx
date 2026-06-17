"use client";

import * as React from "react";
import { Check, X, Lock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt } from "./money-format";
import type { DocumentDTO } from "@/lib/modules/finance";

const DOC_LABEL: Record<string, string> = { ESTIMATE: "Estimate", QUOTE: "Quote", INVOICE: "Invoice" };

export function PublicDocumentView({ doc, businessName, paymentsEnabled }: { doc: DocumentDTO; businessName: string | null; paymentsEnabled: boolean }) {
  const [status, setStatus] = React.useState(doc.status);
  const [busy, setBusy] = React.useState(false);
  const [payErr, setPayErr] = React.useState<string | null>(null);
  const isQuoteish = doc.docType === "ESTIMATE" || doc.docType === "QUOTE";
  const decided = status === "ACCEPTED" || status === "DECLINED";

  async function decide(decision: "ACCEPTED" | "DECLINED") {
    setBusy(true);
    const res = await fetch(`/api/v1/public/finance/${doc.publicToken}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusy(false);
    if (res.ok) setStatus(decision);
  }

  async function pay(deposit: boolean) {
    setBusy(true);
    setPayErr(null);
    try {
      const res = await fetch(`/api/v1/public/finance/${doc.publicToken}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (data?.url) window.location.href = data.url;
      else setPayErr(data?.error === "payments_unavailable" ? "Online payment isn't available right now." : "Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  const canPay = paymentsEnabled && doc.balanceDue > 0;
  const showDeposit = canPay && doc.depositAmount > 0 && doc.amountPaid === 0 && doc.depositAmount < doc.balanceDue;

  return (
    <div className="min-h-dvh bg-stone-100 py-10">
      <div className="mx-auto max-w-2xl px-4">
        <article className="rounded-2xl border border-stone-200 bg-white p-8 shadow-card">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-2xl text-stone-900">{businessName ?? "Your provider"}</p>
              <p className="mt-1 text-sm text-stone-500">{DOC_LABEL[doc.docType]} {doc.number}</p>
            </div>
            <div className="text-right text-sm text-stone-500">
              {doc.issueDate && <p>{new Date(doc.issueDate).toLocaleDateString()}</p>}
              {doc.dueDate && <p>Due {new Date(doc.dueDate).toLocaleDateString()}</p>}
              {doc.expiresAt && <p>Valid until {new Date(doc.expiresAt).toLocaleDateString()}</p>}
            </div>
          </header>

          <div className="mt-6 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Billed to</p>
            <p className="mt-1 font-medium text-stone-900">{doc.customerName ?? "—"}</p>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lineItems.map((l) => (
                <tr key={l.id} className="border-b border-stone-100">
                  <td className="py-2 text-stone-800">{l.description}</td>
                  <td className="py-2 text-right text-stone-600">{l.quantity}</td>
                  <td className="py-2 text-right font-medium text-stone-800">{fmt(l.amount, doc.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd>{fmt(doc.subtotal, doc.currency)}</dd></div>
              {doc.discountTotal > 0 && <div className="flex justify-between"><dt className="text-stone-500">Discount</dt><dd>−{fmt(doc.discountTotal, doc.currency)}</dd></div>}
              {doc.tax > 0 && <div className="flex justify-between"><dt className="text-stone-500">Tax</dt><dd>{fmt(doc.tax, doc.currency)}</dd></div>}
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-base font-semibold text-stone-900"><dt>Total</dt><dd>{fmt(doc.total, doc.currency)}</dd></div>
              {doc.amountPaid > 0 && <div className="flex justify-between text-green-700"><dt>Paid</dt><dd>−{fmt(doc.amountPaid, doc.currency)}</dd></div>}
              {doc.balanceDue > 0 && doc.amountPaid > 0 && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{fmt(doc.balanceDue, doc.currency)}</dd></div>}
            </dl>
          </div>

          {(doc.notes || doc.terms) && (
            <div className="mt-6 space-y-3 border-t border-stone-100 pt-4 text-sm">
              {doc.notes && <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-stone-600">{doc.notes}</p></div>}
              {doc.terms && <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Terms</p><p className="mt-1 whitespace-pre-wrap text-stone-600">{doc.terms}</p></div>}
            </div>
          )}

          {/* Accept / decline for estimates & quotes */}
          {isQuoteish && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              {decided ? (
                <p className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", status === "ACCEPTED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                  {status === "ACCEPTED" ? <Check size={15} /> : <X size={15} />} You {status.toLowerCase()} this {doc.docType.toLowerCase()}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => decide("ACCEPTED")}><Check size={16} /> Accept</Button>
                  <Button variant="outline" disabled={busy} onClick={() => decide("DECLINED")}><X size={16} /> Decline</Button>
                </div>
              )}
            </div>
          )}

          {/* Invoice payment */}
          {doc.docType === "INVOICE" && doc.balanceDue > 0 && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              {status === "PAID" ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"><Check size={15} /> Paid in full</p>
              ) : canPay ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={busy} onClick={() => pay(false)}>Pay {fmt(doc.balanceDue, doc.currency)}</Button>
                    {showDeposit && <Button variant="outline" disabled={busy} onClick={() => pay(true)}>Pay deposit {fmt(doc.depositAmount, doc.currency)}</Button>}
                  </div>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400"><Lock size={11} /> Secure payment by PageBee Pay</p>
                </>
              ) : (
                <Button disabled className="opacity-60">Online payment unavailable</Button>
              )}
              {payErr && <p className="mt-2 text-sm text-red-600">{payErr}</p>}
            </div>
          )}
        </article>
        <div className="mt-4 text-center">
          <a href={`/api/v1/public/finance/${doc.publicToken}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800">
            <Download size={14} /> Download PDF
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-stone-400">Powered by PageBee</p>
      </div>
    </div>
  );
}
