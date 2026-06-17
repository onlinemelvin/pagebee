"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Send, ArrowRight, Printer, Trash2, DollarSign, Copy, Check, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmt } from "./money-format";
import type { DocumentDTO } from "@/lib/modules/finance";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-stone-200 text-stone-500",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  VOID: "bg-stone-200 text-stone-500 line-through",
};
const DOC_LABEL: Record<string, string> = { ESTIMATE: "Estimate", QUOTE: "Quote", INVOICE: "Invoice" };

export function DocumentView({ doc, appUrl }: { doc: DocumentDTO; appUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [pay, setPay] = React.useState(false);
  const [payAmt, setPayAmt] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/client/finance/documents/${doc.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
      const json = (await res.json().catch(() => null)) as { document?: DocumentDTO } | null;
      if (body.action === "convert" && json?.document) router.push(`/client/invoices/${json.document.id}`);
    } finally {
      setBusy(false);
      setPay(false);
    }
  }

  async function del() {
    if (!confirm("Delete this draft permanently?")) return;
    setBusy(true);
    const res = await fetch(`/api/v1/client/finance/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/client/invoices");
      router.refresh();
    } else setBusy(false);
  }

  const isInvoice = doc.docType === "INVOICE";
  const isQuoteish = doc.docType === "ESTIMATE" || doc.docType === "QUOTE";
  const editable = doc.status === "DRAFT";
  const publicUrl = doc.publicToken ? `${appUrl}/d/${doc.publicToken}` : null;

  return (
    <div>
      {/* Action bar (hidden when printing) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/client/invoices" className="text-sm text-stone-500 hover:underline">← Finance</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editable && (
            <Link href={`/client/invoices/${doc.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Pencil size={14} /> Edit
            </Link>
          )}
          {doc.status !== "PAID" && doc.status !== "VOID" && (
            <Button size="sm" disabled={busy} onClick={() => act({ action: "send" })}>
              <Send size={14} /> {doc.sentAt ? "Resend" : "Send"}
            </Button>
          )}
          {isQuoteish && doc.docType === "ESTIMATE" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "convert", toType: "QUOTE" })}>
              <ArrowRight size={14} /> To quote
            </Button>
          )}
          {isQuoteish && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "convert", toType: "INVOICE" })}>
              <ArrowRight size={14} /> To invoice
            </Button>
          )}
          {isInvoice && doc.status !== "PAID" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPay((p) => !p)}>
              <DollarSign size={14} /> Record payment
            </Button>
          )}
          <a href={`/api/v1/client/finance/documents/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"><Download size={14} /> PDF</a>
          <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          {editable && (
            <button onClick={del} disabled={busy} className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
          )}
        </div>
      </div>

      {pay && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 print:hidden">
          <span className="text-sm text-stone-600">Record an offline payment (cash, check, transfer). Balance: <strong>{fmt(doc.balanceDue, doc.currency)}</strong></span>
          <span className="ml-auto flex items-center gap-1"><span className="text-stone-400">$</span>
            <Input type="number" min={0} step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className="h-8 w-28" placeholder="0.00" />
          </span>
          <Button size="sm" disabled={busy || !payAmt} onClick={() => act({ action: "payment", amount: Math.round((parseFloat(payAmt) || 0) * 100) })}>Record</Button>
        </div>
      )}

      {publicUrl && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm print:hidden">
          <span className="text-stone-500">Customer link</span>
          <code className="truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-700">{publicUrl}</code>
          <button onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-auto inline-flex items-center gap-1 text-amber-700 hover:underline">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* The document itself */}
      <article className="mt-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-card print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl text-stone-900">{DOC_LABEL[doc.docType]}</p>
            <p className="mt-1 text-sm text-stone-500">{doc.number}</p>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", STATUS_STYLE[doc.status] ?? "bg-stone-100 text-stone-600")}>{doc.status.replace("_", " ")}</span>
        </header>

        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Bill to</p>
            <p className="mt-1 font-medium text-stone-900">{doc.customerName ?? "—"}</p>
            {doc.customerEmail && <p className="text-stone-600">{doc.customerEmail}</p>}
            {doc.customerPhone && <p className="text-stone-600">{doc.customerPhone}</p>}
          </div>
          <div className="sm:text-right">
            {doc.issueDate && <p><span className="text-stone-400">Issued </span>{new Date(doc.issueDate).toLocaleDateString()}</p>}
            {doc.dueDate && <p><span className="text-stone-400">Due </span>{new Date(doc.dueDate).toLocaleDateString()}</p>}
            {doc.expiresAt && <p><span className="text-stone-400">Valid until </span>{new Date(doc.expiresAt).toLocaleDateString()}</p>}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lineItems.map((l) => (
              <tr key={l.id} className="border-b border-stone-100">
                <td className="py-2 text-stone-800">{l.description}{l.taxRateBps ? <span className="ml-1 text-xs text-stone-400">+{(l.taxRateBps / 100).toFixed(2)}% tax</span> : null}</td>
                <td className="py-2 text-right text-stone-600">{l.quantity}</td>
                <td className="py-2 text-right text-stone-600">{fmt(l.unitAmount, doc.currency)}</td>
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
            {doc.amountPaid > 0 && doc.balanceDue > 0 && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{fmt(doc.balanceDue, doc.currency)}</dd></div>}
            {doc.depositAmount > 0 && <div className="flex justify-between text-stone-500"><dt>Deposit requested</dt><dd>{fmt(doc.depositAmount, doc.currency)}</dd></div>}
          </dl>
        </div>

        {(doc.notes || doc.terms) && (
          <div className="mt-6 grid gap-4 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
            {doc.notes && <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-stone-600">{doc.notes}</p></div>}
            {doc.terms && <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Terms</p><p className="mt-1 whitespace-pre-wrap text-stone-600">{doc.terms}</p></div>}
          </div>
        )}
      </article>
    </div>
  );
}
