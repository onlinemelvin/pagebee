"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pause, Play, X, RefreshCw, CreditCard, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmt, toCents, toDollars } from "./money-format";
import type { RecurringPlanDTO } from "@/lib/modules/finance";

interface CustomerOpt { id: string; name: string | null; email: string | null }
interface ServiceOpt { id: string; title: string; price: number | null }

const INTERVALS = [
  { v: "WEEKLY", label: "Weekly" },
  { v: "BIWEEKLY", label: "Every 2 weeks" },
  { v: "MONTHLY", label: "Monthly" },
  { v: "QUARTERLY", label: "Every 3 months" },
  { v: "YEARLY", label: "Yearly" },
] as const;
const INTERVAL_LABEL: Record<string, string> = Object.fromEntries(INTERVALS.map((i) => [i.v, i.label]));

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-800",
  ENDED: "bg-stone-200 text-stone-500",
};

interface LineRow { key: string; description: string; quantity: number; unit: string; serviceId: string | null }
let kc = 0;
const blankLine = (): LineRow => ({ key: `r${kc++}`, description: "", quantity: 1, unit: "", serviceId: null });

export function RecurringManager({
  initialPlans,
  customers,
  services,
}: {
  initialPlans: RecurringPlanDTO[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
}) {
  const router = useRouter();
  const [plans, setPlans] = React.useState(initialPlans);
  const [showCreate, setShowCreate] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null);

  React.useEffect(() => setPlans(initialPlans), [initialPlans]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/client/finance/recurring/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) router.refresh();
  }
  async function del(id: string) {
    const res = await fetch(`/api/v1/client/finance/recurring/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDel(null);
      router.refresh();
    }
  }

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New recurring plan</Button>
      </div>

      {plans.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/50 px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-amber-500 shadow-sm"><RefreshCw size={22} /></span>
          <p className="mt-4 font-medium text-stone-700">No recurring plans yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">Set up automatic billing for repeat work like lawn care or cleaning — pick a customer, what to bill, and how often.</p>
          <Button className="mt-5" onClick={() => setShowCreate(true)}><Plus size={16} /> New recurring plan</Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">{p.title}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[p.status])}>{p.status}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {p.mode === "AUTO_CHARGE" ? <CreditCard size={11} /> : <Mail size={11} />}
                      {p.mode === "AUTO_CHARGE" ? "Auto-charge" : "Invoice"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {p.customerName ?? "—"} · {INTERVAL_LABEL[p.interval]} · {fmt(p.amountPerCycle, p.currency)}/cycle
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {p.status === "ACTIVE" ? `Next: ${new Date(p.nextRunAt).toLocaleDateString()}` : p.status === "PAUSED" ? "Paused" : "Ended"}
                    {p.occurrences > 0 && ` · ${p.occurrences} sent`}
                    {p.mode === "AUTO_CHARGE" && !p.hasCardOnFile && " · no card on file yet (sends a pay link)"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {p.status === "ACTIVE" && <button onClick={() => patch(p.id, { status: "PAUSED" })} title="Pause" className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"><Pause size={16} /></button>}
                  {p.status === "PAUSED" && <button onClick={() => patch(p.id, { status: "ACTIVE" })} title="Resume" className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"><Play size={16} /></button>}
                  {confirmDel === p.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button onClick={() => setConfirmDel(null)} className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100">Keep</button>
                      <button onClick={() => del(p.id)} className="rounded-lg bg-red-600 px-2 py-1 text-sm font-medium text-white hover:bg-red-700">Delete</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDel(p.id)} title="Delete" className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && <CreatePlanModal customers={customers} services={services} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); router.refresh(); }} />}
    </div>
  );
}

function CreatePlanModal({ customers, services, onClose, onCreated }: { customers: CustomerOpt[]; services: ServiceOpt[]; onClose: () => void; onCreated: () => void }) {
  const [customerId, setCustomerId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [interval, setInterval] = React.useState<string>("MONTHLY");
  const [mode, setMode] = React.useState<"INVOICE" | "AUTO_CHARGE">("INVOICE");
  const [dueDays, setDueDays] = React.useState("14");
  const [startDate, setStartDate] = React.useState("");
  const [lines, setLines] = React.useState<LineRow[]>([blankLine()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function setLine(key: string, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function pickService(key: string, id: string) {
    const svc = services.find((s) => s.id === id);
    if (!svc) return setLine(key, { serviceId: null });
    setLine(key, { serviceId: svc.id, description: svc.title, unit: svc.price != null ? toDollars(svc.price) : "" });
  }
  const total = lines.reduce((sum, l) => sum + (l.quantity || 0) * toCents(l.unit), 0);

  async function create() {
    if (!customerId) return setError("Pick a customer.");
    if (!title.trim()) return setError("Give the plan a name.");
    const filled = lines.filter((l) => l.description.trim());
    if (filled.length === 0) return setError("Add at least one line.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          title: title.trim(),
          interval,
          mode,
          dueDays: Number(dueDays) || 14,
          startDate: startDate || undefined,
          lineItems: filled.map((l) => ({ serviceId: l.serviceId, description: l.description.trim(), quantity: l.quantity || 1, unitAmount: toCents(l.unit), taxRateId: null })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error === "validation_error" ? "Please check the details." : data?.error ?? `Failed (${res.status})`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => !busy && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-stone-900">New recurring plan</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-xl border border-stone-300 px-3 py-2 text-sm">
              <option value="">Select a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name ?? "Unnamed"}{c.email ? ` · ${c.email}` : ""}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Plan name
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly lawn mowing" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Frequency
              <select value={interval} onChange={(e) => setInterval(e.target.value)} className="rounded-xl border border-stone-300 px-3 py-2 text-sm">
                {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              First charge date
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-stone-700">Billing method</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("INVOICE")} className={cn("flex items-center gap-2 rounded-xl border p-3 text-left text-sm", mode === "INVOICE" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-stone-200 hover:bg-stone-50")}>
                <Mail size={16} /> <span><span className="block font-medium text-stone-900">Send invoice</span><span className="block text-xs text-stone-500">Email + pay link each cycle</span></span>
              </button>
              <button type="button" onClick={() => setMode("AUTO_CHARGE")} className={cn("flex items-center gap-2 rounded-xl border p-3 text-left text-sm", mode === "AUTO_CHARGE" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-stone-200 hover:bg-stone-50")}>
                <CreditCard size={16} /> <span><span className="block font-medium text-stone-900">Auto-charge</span><span className="block text-xs text-stone-500">Charge saved card (else pay link)</span></span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-stone-700">What to bill</p>
            <div className="mt-1 space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex flex-wrap items-center gap-2">
                  {services.length > 0 && (
                    <select value={l.serviceId ?? ""} onChange={(e) => pickService(l.key, e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-600">
                      <option value="">Item…</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  )}
                  <Input placeholder="Description" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} className="min-w-[140px] flex-1" />
                  <label className="flex items-center gap-1 text-sm text-stone-500">Qty<Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-14" /></label>
                  <label className="flex items-center gap-1 text-sm text-stone-500">$<Input type="number" min={0} step="0.01" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} className="w-24" placeholder="0.00" /></label>
                  <button onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== l.key) : rows))} className="text-stone-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines((rows) => [...rows, blankLine()])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline"><Plus size={14} /> Add line</button>
          </div>

          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Payment due (days after each invoice)
            <Input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className="w-24" />
          </label>

          <p className="text-right text-sm text-stone-500">Per cycle: <span className="font-semibold text-stone-800">{fmt(total)}</span></p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={create}>{busy ? "Creating…" : "Create plan"}</Button>
        </div>
      </div>
    </div>
  );
}
