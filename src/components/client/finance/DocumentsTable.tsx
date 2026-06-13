"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./money-format";
import { EmptyState } from "@/components/client/ui/EmptyState";
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
  VOID: "bg-stone-200 text-stone-500",
};

const TABS = [
  { key: "ALL", label: "All" },
  { key: "INVOICE", label: "Invoices" },
  { key: "QUOTE", label: "Quotes" },
  { key: "ESTIMATE", label: "Estimates" },
] as const;

export function DocumentsTable({ documents }: { documents: DocumentDTO[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("ALL");
  const rows = tab === "ALL" ? documents : documents.filter((d) => d.docType === tab);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-1 border-b border-stone-100 p-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={tab === "ALL" ? FileText : FilePlus2}
            title={tab === "ALL" ? "No documents yet" : `No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} yet`}
            description="Create a polished invoice, quote, or estimate in under a minute — add line items from your services, then send a payment link."
            cta={{ label: "New invoice", href: "/client/invoices/new?type=INVOICE", icon: FilePlus2 }}
          />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
              <th className="px-4 py-2">Number</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.id}
                onClick={() => router.push(`/client/invoices/${d.id}`)}
                className="cursor-pointer border-b border-stone-50 hover:bg-stone-50"
              >
                <td className="px-4 py-2.5">
                  <Link href={`/client/invoices/${d.id}`} className="font-medium text-stone-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {d.number}
                  </Link>
                  {d.docType !== "INVOICE" && <span className="ml-1.5 text-xs text-stone-400">{d.docType.toLowerCase()}</span>}
                </td>
                <td className="px-4 py-2.5 text-stone-700">{d.customerName ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500">{d.issueDate ? new Date(d.issueDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[d.status] ?? "bg-stone-100 text-stone-600")}>{d.status.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-stone-800">{fmt(d.total, d.currency)}</td>
                <td className="px-4 py-2.5 text-right text-stone-600">{d.balanceDue > 0 ? fmt(d.balanceDue, d.currency) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
