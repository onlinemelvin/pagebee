"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, BadgePercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { usdFromCents } from "@/lib/format";

export interface PreviewDiscountRow {
  id: string;
  previewId: string;
  rep: string;
  prospect: string;
  plan: string;
  listedSetupCents: number;
  requestedPct: number;
  requestedSetupCents: number;
  listedMonthlyCents: number;
  requestedMonthlyPct: number;
  requestedMonthlyCents: number;
  promoMonths: number;
  createdAt: string;
}

const fmt = usdFromCents;

/** Admin queue for rep preview setup-discount requests that fell below the plan floor. */
export function PreviewDiscountQueue({ initial }: { initial: PreviewDiscountRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<Record<string, string>>({});

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/previews/discount-approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comments[id] || undefined }),
      });
      if (res.ok) {
        toast.success(decision === "APPROVED" ? "Discount approved" : "Discount rejected");
        router.refresh();
      } else {
        toast.error("Could not record decision");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
        <BadgePercent size={28} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No preview discounts awaiting approval.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {initial.map((a) => (
        <li key={a.id} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">
                {a.prospect} · <span className="capitalize">{a.plan.toLowerCase()}</span>
              </p>
              <p className="text-xs text-stone-400">Requested by {a.rep}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.requestedPct > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {a.requestedPct}% off setup · below floor
                </span>
              ) : null}
              {a.requestedMonthlyPct > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {a.requestedMonthlyPct}% monthly promo · {a.promoMonths} mo
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            {a.requestedPct > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Setup fee</p>
                <p className="mt-1">
                  <span className="text-stone-400 line-through">{fmt(a.listedSetupCents)}</span>
                  <span className="ml-2 font-semibold text-amber-700">{fmt(a.requestedSetupCents)}</span>
                </p>
              </div>
            ) : null}
            {a.requestedMonthlyPct > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Monthly (first {a.promoMonths} mo)</p>
                <p className="mt-1">
                  <span className="text-stone-400 line-through">{fmt(a.listedMonthlyCents)}</span>
                  <span className="ml-2 font-semibold text-amber-700">{fmt(a.requestedMonthlyCents)}</span>
                  <span className="ml-1 text-xs text-stone-400">then {fmt(a.listedMonthlyCents)}</span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              value={comments[a.id] ?? ""}
              onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })}
              placeholder="Comment (optional)"
              className="flex-1 min-w-[200px]"
            />
            <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => decide(a.id, "REJECTED")}>
              <X size={14} /> Reject
            </Button>
            <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, "APPROVED")}>
              <Check size={14} /> Approve
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
