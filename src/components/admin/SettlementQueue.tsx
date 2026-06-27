"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, DollarSign, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usd } from "@/lib/format";

export interface SettlementRecord {
  id: string;
  status: string;
  basis: string;
  amount: number;
  clientName: string | null;
}
export interface RepSettlementGroup {
  repId: string;
  repName: string;
  eligibleTotal: number;
  approvedTotal: number;
  records: SettlementRecord[];
}

const money = (n: number) => usd(n, { cents: true });

export function SettlementQueue({ initial }: { initial: RepSettlementGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [payoutRef, setPayoutRef] = React.useState<Record<string, string>>({});

  async function approve(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/commissions/${id}/approve`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function payRep(group: RepSettlementGroup) {
    const ids = group.records.filter((r) => r.status === "APPROVED" && selected[r.id]).map((r) => r.id);
    const ref = (payoutRef[group.repId] ?? "").trim();
    if (ids.length === 0 || !ref) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/commissions/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: ids, payoutReference: ref }),
      });
      if (res.ok) {
        setSelected({});
        setPayoutRef((p) => ({ ...p, [group.repId]: "" }));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
        <Wallet size={28} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No commissions awaiting approval or payout.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {initial.map((g) => {
        const selectedApproved = g.records.filter((r) => r.status === "APPROVED" && selected[r.id]);
        return (
          <section key={g.repId} className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-stone-900">{g.repName}</p>
                <p className="text-xs text-stone-400">
                  {money(g.eligibleTotal)} eligible · {money(g.approvedTotal)} approved
                </p>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-stone-100">
              {g.records.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {r.status === "APPROVED" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(selected[r.id])}
                      onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                      className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400"
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="flex-1 text-stone-700">
                    {r.clientName ?? "—"} <span className="text-stone-400">· {r.basis.replace("_", " ")}</span>
                  </span>
                  <span className="font-semibold text-stone-900">{money(r.amount)}</span>
                  <StatusBadge status={r.status} />
                  {r.status === "ELIGIBLE" ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => approve(r.id)}>
                      <Check size={14} /> Approve
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>

            {g.approvedTotal > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
                <Input
                  value={payoutRef[g.repId] ?? ""}
                  onChange={(e) => setPayoutRef((p) => ({ ...p, [g.repId]: e.target.value }))}
                  placeholder="Payout reference (e.g. Upwork milestone #)"
                  className="flex-1 min-w-[220px]"
                />
                <Button
                  size="sm"
                  disabled={busy || selectedApproved.length === 0 || !(payoutRef[g.repId] ?? "").trim()}
                  onClick={() => payRep(g)}
                >
                  <DollarSign size={14} /> Mark {selectedApproved.length || ""} paid
                </Button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
