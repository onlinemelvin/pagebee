"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, X, Send, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/toast";
import { usdFromCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface QuoteRow {
  id: string;
  status: string;
  plan: string;
  offeredSetupFee: number; // cents
  offeredMonthlyFee: number; // cents
  requiresApproval: boolean;
}

export interface PlanPricing {
  NECTAR: { setup: number; monthly: number };
  HONEY: { setup: number; monthly: number };
  HIVE: { setup: number; monthly: number };
}

const ERROR_COPY: Record<string, string> = {
  certification_required: "You must be certified before sending quotes. Ask your manager.",
  contract_required: "Your agreement must be active before quoting.",
  offer_above_listed: "An offer can't exceed listed pricing.",
  approval_required: "This quote needs admin approval before it can be sent.",
  validation_error: "Check the quote amounts and try again.",
  prospect_email_required: "Add an email to the prospect before converting.",
  prospect_already_converted: "This prospect is already a client.",
  already_converted: "This quote is already converted.",
  email_taken: "A client account already exists for that email.",
};

const CONVERTIBLE = new Set(["DRAFT", "APPROVED", "SENT", "VIEWED", "ACCEPTED"]);

const fmt = usdFromCents;

export function QuotesPanel({
  prospectId,
  quotes,
  pricing,
  canQuote,
}: {
  prospectId: string;
  quotes: QuoteRow[];
  pricing: PlanPricing;
  canQuote: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<keyof PlanPricing>("HONEY");
  const [setupDollars, setSetupDollars] = React.useState(String(pricing.HONEY.setup / 100));
  const [monthlyDollars, setMonthlyDollars] = React.useState(String(pricing.HONEY.monthly / 100));
  const [reason, setReason] = React.useState("");

  function selectPlan(p: keyof PlanPricing) {
    setPlan(p);
    setSetupDollars(String(pricing[p].setup / 100));
    setMonthlyDollars(String(pricing[p].monthly / 100));
  }

  const offeredSetup = Math.round(parseFloat(setupDollars || "0") * 100);
  const offeredMonthly = Math.round(parseFloat(monthlyDollars || "0") * 100);
  const willNeedApproval = offeredMonthly < pricing[plan].monthly || offeredSetup < FLOORS[plan];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/rep/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          plan,
          offeredSetupFee: offeredSetup,
          offeredMonthlyFee: offeredMonthly,
          discountReason: reason || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_COPY[data.error ?? ""] ?? "Could not create quote.");
        return;
      }
      setAdding(false);
      setReason("");
      toast.success(willNeedApproval ? "Quote created — sent for admin approval" : "Quote created");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function send(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/rep/quotes/${id}/send`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(ERROR_COPY[data.error ?? ""] ?? "Could not send quote.");
        return;
      }
      toast.success("Quote sent to the prospect");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function convert(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/rep/quotes/${id}/convert`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(ERROR_COPY[data.error ?? ""] ?? "Could not convert quote.");
        return;
      }
      toast.success("Converted — the prospect is now a client 🎉");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <FileText size={16} /> Quotes
        </h2>
        {canQuote ? (
          <Button size="sm" variant={adding ? "ghost" : "outline"} onClick={() => setAdding((v) => !v)}>
            {adding ? <X size={14} /> : <Plus size={14} />} {adding ? "Cancel" : "New quote"}
          </Button>
        ) : (
          <span className="text-xs text-stone-400">Certification required to quote</span>
        )}
      </div>

      {adding ? (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-stone-100 bg-stone-50 p-4">
          <div className="flex gap-2">
            {(Object.keys(pricing) as Array<keyof PlanPricing>).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => selectPlan(p)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors",
                  plan === p ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600",
                )}
              >
                {p.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Setup fee ($)</span>
              <Input type="number" min={0} value={setupDollars} onChange={(e) => setSetupDollars(e.target.value)} />
              <span className="mt-1 block text-[11px] text-stone-400">Listed {fmt(pricing[plan].setup)} · floor {fmt(FLOORS[plan])}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Monthly ($)</span>
              <Input type="number" min={0} value={monthlyDollars} onChange={(e) => setMonthlyDollars(e.target.value)} />
              <span className="mt-1 block text-[11px] text-stone-400">Listed {fmt(pricing[plan].monthly)}</span>
            </label>
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Discount reason (if any)" />
          {willNeedApproval ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <Clock size={12} /> This offer needs admin approval before it can be sent.
            </p>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create quote"}
            </Button>
          </div>
        </form>
      ) : null}

      {error && !adding ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {quotes.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">No quotes yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-center gap-3 py-3">
              <span className="text-sm font-medium capitalize text-stone-800">{q.plan.toLowerCase()}</span>
              <span className="text-sm text-stone-500">
                {fmt(q.offeredSetupFee)} setup · {fmt(q.offeredMonthlyFee)}/mo
              </span>
              <StatusBadge status={q.status} className="ml-auto" />
              {q.status === "DRAFT" || q.status === "APPROVED" ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => send(q.id)}>
                  <Send size={14} /> Send
                </Button>
              ) : null}
              {CONVERTIBLE.has(q.status) ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => convert(q.id)}>
                  <UserCheck size={14} /> Convert
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const FLOORS: Record<string, number> = { NECTAR: 29900, HONEY: 59900, HIVE: 89900 };
