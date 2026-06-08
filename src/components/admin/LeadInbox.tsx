"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
// Import from the schema (zod-only) — NOT the module index, which pulls Prisma into the client bundle.
import { LEAD_STATUSES } from "@/lib/modules/lead/schema";

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  type: string;
  status: string;
  source: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  QUALIFIED: "bg-violet-100 text-violet-800",
  BOOKED: "bg-teal-100 text-teal-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-stone-200 text-stone-600",
  SPAM: "bg-red-100 text-red-700",
};

export function LeadInbox({ leads, activeStatus }: { leads: LeadRow[]; activeStatus: string | null }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function changeStatus(id: string, status: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/v1/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mt-6">
      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <FilterChip href="/admin/leads" label="All" active={!activeStatus} />
        {LEAD_STATUSES.map((s) => (
          <FilterChip key={s} href={`/admin/leads?status=${s}`} label={s} active={activeStatus === s} />
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Message</th>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-400">
                  No leads yet. Submit the contact form on the marketing site to create one.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="align-top">
                <td className="px-4 py-3 font-medium text-stone-900">{lead.name}</td>
                <td className="px-4 py-3 text-stone-600">
                  <div>{lead.email ?? "—"}</div>
                  <div className="text-stone-400">{lead.phone ?? ""}</div>
                </td>
                <td className="max-w-xs px-4 py-3 text-stone-600">
                  <span className="line-clamp-2">{lead.message ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                      STATUS_STYLES[lead.status] ?? "bg-stone-100 text-stone-600",
                    )}
                  >
                    {lead.status}
                  </span>
                  <select
                    className="block rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    value={lead.status}
                    disabled={pendingId === lead.id}
                    onChange={(e) => changeStatus(lead.id, e.target.value)}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100",
      )}
    >
      {label}
    </Link>
  );
}
