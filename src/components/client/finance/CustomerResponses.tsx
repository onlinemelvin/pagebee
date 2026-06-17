import Link from "next/link";
import { Eye, Send, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { fmt } from "./money-format";
import type { DocumentDTO } from "@/lib/modules/finance";

const DOC_NOUN: Record<string, string> = { INVOICE: "invoice", ESTIMATE: "estimate", QUOTE: "quote" };

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/**
 * Dashboard panel that surfaces "what customers did": estimates/quotes/invoices that have been sent
 * and are awaiting the customer (sent vs. opened), and recent responses (accepted, declined, paid).
 * Pure display — derived from the documents already loaded for the dashboard.
 */
export function CustomerResponses({ documents }: { documents: DocumentDTO[] }) {
  const awaiting = documents
    .filter((d) => d.status === "SENT" || d.status === "VIEWED")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))
    .slice(0, 6);

  const responded = documents
    .filter((d) => d.acceptedAt || d.declinedAt || (d.docType === "INVOICE" && d.paidAt))
    .sort((a, b) => {
      const at = a.acceptedAt ?? a.declinedAt ?? a.paidAt ?? "";
      const bt = b.acceptedAt ?? b.declinedAt ?? b.paidAt ?? "";
      return bt.localeCompare(at);
    })
    .slice(0, 6);

  if (awaiting.length === 0 && responded.length === 0) return null;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700"><Send size={15} className="text-stone-400" /> Awaiting your customer</h2>
        {awaiting.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Nothing waiting — sent estimates and invoices show up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {awaiting.map((d) => (
              <li key={d.id}>
                <Link href={`/client/invoices/${d.id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
                  <span className={d.status === "VIEWED" ? "text-indigo-500" : "text-stone-400"}>{d.status === "VIEWED" ? <Eye size={16} /> : <Send size={16} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800">{d.customerName ?? "—"}</span>
                    <span className="block truncate text-xs text-stone-500">{d.number} · {DOC_NOUN[d.docType]} · {d.status === "VIEWED" ? "opened" : "sent"} {when(d.sentAt)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-stone-700">{fmt(d.total, d.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700"><CheckCircle2 size={15} className="text-stone-400" /> Recent responses</h2>
        {responded.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">When customers accept, decline, or pay, it shows here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {responded.map((d) => {
              const accepted = Boolean(d.acceptedAt);
              const declined = Boolean(d.declinedAt) && !accepted;
              const paid = d.docType === "INVOICE" && Boolean(d.paidAt);
              const { icon, tone, label, date } = paid
                ? { icon: <Wallet size={16} />, tone: "text-green-600", label: "paid", date: d.paidAt }
                : accepted
                  ? { icon: <CheckCircle2 size={16} />, tone: "text-green-600", label: "accepted", date: d.acceptedAt }
                  : declined
                    ? { icon: <XCircle size={16} />, tone: "text-red-500", label: "declined", date: d.declinedAt }
                    : { icon: <CheckCircle2 size={16} />, tone: "text-stone-400", label: d.status.toLowerCase(), date: d.sentAt };
              return (
                <li key={d.id}>
                  <Link href={`/client/invoices/${d.id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
                    <span className={tone}>{icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-800">{d.customerName ?? "—"}</span>
                      <span className="block truncate text-xs text-stone-500">{d.number} · {DOC_NOUN[d.docType]} · {label} {when(date)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-stone-700">{fmt(d.total, d.currency)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
