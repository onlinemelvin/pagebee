"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PayPeriodRow {
  id: string;
  label: string;
  status: string;
  startDate: string;
  endDate: string;
  recordCount: number;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  APPROVED: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
};

const date = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PayrollPeriods({ initial }: { initial: PayPeriodRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ label: "", startDate: "", endDate: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/payroll/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error === "invalid_range" ? "End date must be after start date." : "Could not create period.");
        return;
      }
      setForm({ label: "", startDate: "", endDate: "" });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{initial.length} period{initial.length === 1 ? "" : "s"}</p>
        <Button onClick={() => setAdding((v) => !v)} variant={adding ? "ghost" : "primary"}>
          {adding ? <X size={16} /> : <Plus size={16} />} {adding ? "Cancel" : "New period"}
        </Button>
      </div>

      {adding ? (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Label"><Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="2026-07 first half" /></Field>
            <Field label="Start"><Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End"><Input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create period"}</Button>
          </div>
        </form>
      ) : null}

      {initial.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <p className="text-sm text-stone-500">No pay periods yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {initial.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/payroll/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-stone-50">
                <div className="flex-1">
                  <p className="font-medium text-stone-900">{p.label}</p>
                  <p className="text-xs text-stone-400">{date(p.startDate)} – {date(p.endDate)} · {p.recordCount} records</p>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLES[p.status] ?? "")}>
                  {p.status.toLowerCase()}
                </span>
                <ChevronRight size={16} className="text-stone-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
      {children}
    </label>
  );
}
