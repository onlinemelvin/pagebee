"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FinanceSettings as FS, TaxRateDTO } from "@/lib/modules/finance";

export function FinanceSettings({ initialSettings, initialTaxRates, taxMode }: { initialSettings: FS; initialTaxRates: TaxRateDTO[]; taxMode?: "manual" | "automatic" }) {
  const router = useRouter();
  const [s, setS] = React.useState<FS>(initialSettings);
  const [phase, setPhase] = React.useState<"idle" | "saving" | "saved">("idle");

  // Tax rate add form
  const [trName, setTrName] = React.useState("");
  const [trPct, setTrPct] = React.useState("");
  const [trIncl, setTrIncl] = React.useState(false);
  const [trBusy, setTrBusy] = React.useState(false);

  async function saveSettings() {
    setPhase("saving");
    const res = await fetch("/api/v1/client/finance/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (res.ok) {
      setPhase("saved");
      router.refresh();
      setTimeout(() => setPhase("idle"), 2000);
    } else setPhase("idle");
  }

  async function addTaxRate() {
    if (!trName.trim()) return;
    setTrBusy(true);
    const res = await fetch("/api/v1/client/finance/tax-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trName.trim(), rateBps: Math.round((parseFloat(trPct) || 0) * 100), inclusive: trIncl }),
    });
    setTrBusy(false);
    if (res.ok) {
      setTrName("");
      setTrPct("");
      setTrIncl(false);
      router.refresh();
    }
  }

  async function delTaxRate(id: string) {
    await fetch(`/api/v1/client/finance/tax-rates/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Manual tax rates — hidden when automatic (Stripe Tax) is on. */}
      {taxMode !== "automatic" && (
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <h2 className="font-display text-lg text-stone-900">Tax rates</h2>
        <p className="mt-1 text-sm text-stone-500">Define the rates you charge. Pick one per line when building a document.</p>
        {initialTaxRates.length > 0 && (
          <ul className="mt-3 space-y-2">
            {initialTaxRates.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <span className="text-stone-800">
                  {t.name} · {(t.rateBps / 100).toFixed(2)}% {t.inclusive && <span className="text-stone-400">(inclusive)</span>}
                </span>
                <button onClick={() => delTaxRate(t.id)} className="text-stone-400 hover:text-red-600" aria-label="Remove rate"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm font-medium text-stone-700">Name<Input value={trName} onChange={(e) => setTrName(e.target.value)} placeholder="e.g. Sales Tax" /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Rate %<Input type="number" min={0} step="0.01" value={trPct} onChange={(e) => setTrPct(e.target.value)} className="w-24" placeholder="8.50" /></label>
          <label className="mb-2 flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={trIncl} onChange={(e) => setTrIncl(e.target.checked)} className="h-4 w-4 rounded border-stone-300 accent-amber-500" /> Inclusive</label>
          <Button variant="outline" disabled={trBusy || !trName.trim()} onClick={addTaxRate}><Plus size={15} /> Add</Button>
        </div>
      </section>
      )}

      {/* Document defaults */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <h2 className="font-display text-lg text-stone-900">Document defaults</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">Currency<Input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Invoice due (days)<Input type="number" min={0} value={s.defaultDueDays} onChange={(e) => setS({ ...s, defaultDueDays: Number(e.target.value) || 0 })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Estimate valid (days)<Input type="number" min={1} value={s.estimateValidDays} onChange={(e) => setS({ ...s, estimateValidDays: Number(e.target.value) || 1 })} /></label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">Estimate prefix<Input value={s.numberPrefixes.ESTIMATE} onChange={(e) => setS({ ...s, numberPrefixes: { ...s.numberPrefixes, ESTIMATE: e.target.value } })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Quote prefix<Input value={s.numberPrefixes.QUOTE} onChange={(e) => setS({ ...s, numberPrefixes: { ...s.numberPrefixes, QUOTE: e.target.value } })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Invoice prefix<Input value={s.numberPrefixes.INVOICE} onChange={(e) => setS({ ...s, numberPrefixes: { ...s.numberPrefixes, INVOICE: e.target.value } })} /></label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-stone-700">Default notes<Textarea rows={2} value={s.defaultNotes} onChange={(e) => setS({ ...s, defaultNotes: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Default terms<Textarea rows={2} value={s.defaultTerms} onChange={(e) => setS({ ...s, defaultTerms: e.target.value })} /></label>
        </div>
      </section>

      {/* Business info (shown on documents) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <h2 className="font-display text-lg text-stone-900">Your business details</h2>
        <p className="mt-1 text-sm text-stone-500">Appears in the header of documents your customers see.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-stone-700">Name<Input value={s.businessInfo.name} onChange={(e) => setS({ ...s, businessInfo: { ...s.businessInfo, name: e.target.value } })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Email<Input value={s.businessInfo.email} onChange={(e) => setS({ ...s, businessInfo: { ...s.businessInfo, email: e.target.value } })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Phone<Input value={s.businessInfo.phone} onChange={(e) => setS({ ...s, businessInfo: { ...s.businessInfo, phone: e.target.value } })} /></label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">Address<Input value={s.businessInfo.address} onChange={(e) => setS({ ...s, businessInfo: { ...s.businessInfo, address: e.target.value } })} /></label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button size="lg" disabled={phase === "saving"} onClick={saveSettings}>{phase === "saving" ? "Saving…" : "Save settings"}</Button>
        {phase === "saved" && <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700"><Check size={15} /> Saved</span>}
      </div>
    </div>
  );
}
