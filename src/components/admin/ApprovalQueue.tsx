"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usdFromCents } from "@/lib/format";

export interface ApprovalRow {
  id: string;
  quoteId: string;
  rep: string;
  prospect: string;
  plan: string;
  listedSetup: number;
  offeredSetup: number;
  listedMonthly: number;
  offeredMonthly: number;
  reasons: string[];
  createdAt: string;
}

const REASON_COPY: Record<string, string> = {
  monthly_discount: "Monthly discount",
  setup_below_floor: "Setup below floor",
  setup_waived: "Setup waived",
  multiple_discounts: "Multiple discounts",
};

const fmt = usdFromCents;

export function ApprovalQueue({ initial }: { initial: ApprovalRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<Record<string, string>>({});

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/quotes/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comments[id] || undefined }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
        <FileCheck size={28} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No quotes awaiting approval.</p>
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
              <p className="text-xs text-stone-400">Submitted by {a.rep}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.reasons.map((r) => (
                <span key={r} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {REASON_COPY[r] ?? r}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <Compare label="Setup fee" listed={a.listedSetup} offered={a.offeredSetup} />
            <Compare label="Monthly" listed={a.listedMonthly} offered={a.offeredMonthly} />
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

function Compare({ label, listed, offered }: { label: string; listed: number; offered: number }) {
  const discounted = offered < listed;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1">
        <span className={discounted ? "text-stone-400 line-through" : "font-semibold text-stone-900"}>{fmt(listed)}</span>
        {discounted ? <span className="ml-2 font-semibold text-amber-700">{fmt(offered)}</span> : null}
      </p>
    </div>
  );
}
