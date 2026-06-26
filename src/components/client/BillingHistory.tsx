"use client";

import * as React from "react";
import { FileText, Download } from "lucide-react";
import { formatUsd } from "@/lib/utils";

type Invoice = { id: string; date: string; amountCents: number; status: string; url: string | null; pdf: string | null; description: string };

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  open: "bg-amber-100 text-amber-700",
  void: "bg-stone-100 text-stone-500",
  uncollectible: "bg-rose-100 text-rose-700",
  draft: "bg-stone-100 text-stone-500",
};

/** PageBee billing history — the platform's invoices/receipts to this client, with PDF/receipt links. */
export function BillingHistory() {
  const [invoices, setInvoices] = React.useState<Invoice[] | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/billing/invoices")
      .then((r) => r.json().catch(() => null))
      .then((d: { invoices?: Invoice[] } | null) => active && setInvoices(d?.invoices ?? []))
      .catch(() => active && setInvoices([]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-stone-400" />
        <h3 className="text-sm font-semibold text-stone-800">Billing history &amp; statements</h3>
      </div>

      {invoices === null ? (
        <p className="mt-3 text-sm text-stone-400">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">No charges yet. Your receipts will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-800">{inv.description}</p>
                <p className="text-xs text-stone-400">{inv.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[inv.status] ?? "bg-stone-100 text-stone-500"}`}>
                  {inv.status}
                </span>
                <span className="text-sm font-semibold text-stone-900">{formatUsd(inv.amountCents)}</span>
                {(inv.pdf || inv.url) && (
                  <a
                    href={(inv.pdf || inv.url) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-50 hover:text-stone-700"
                    aria-label="Download receipt"
                  >
                    <Download size={15} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
