"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Check, ArrowLeft, ArrowRight, Search, FileText, ScrollText, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { computeTotals, type LineInput } from "@/lib/modules/finance/money";
import { fmt, toCents, toDollars } from "./money-format";
import type { DocumentDTO, DocType, TaxRateDTO } from "@/lib/modules/finance";
import type { EditorService, EditorCustomer } from "./DocumentEditor";

export interface WizardSettings {
  currency: string;
  defaultTerms: string;
  defaultNotes: string;
}

interface LineRow {
  key: string;
  serviceId: string | null;
  description: string;
  quantity: number;
  unit: string;
  discountType: "" | "PERCENT" | "FIXED";
  discountValue: string;
  taxRateId: string;
}

const DOC_LABEL: Record<DocType, string> = { ESTIMATE: "Estimate", QUOTE: "Quote", INVOICE: "Invoice" };
const DOC_ICON: Record<DocType, React.ComponentType<{ size?: number; className?: string }>> = {
  INVOICE: FilePlus2,
  ESTIMATE: FileText,
  QUOTE: ScrollText,
};

let kc = 0;
const newKey = () => `w${kc++}`;
const blankLine = (): LineRow => ({ key: newKey(), serviceId: null, description: "", quantity: 1, unit: "", discountType: "", discountValue: "", taxRateId: "" });

type StepId = 1 | 2 | 3 | 4;
const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "Customer" },
  { id: 2, label: "Items" },
  { id: 3, label: "Details" },
  { id: 4, label: "Review" },
];

/**
 * Multi-step creation wizard for an estimate/quote/invoice, presented as a modal. Mirrors the rich
 * DocumentEditor's payload exactly (so the same /finance/documents API handles it) but breaks it into
 * concrete steps that are easy for non-technical owners: ① who it's for, ② what they're billing for,
 * ③ totals/dates/notes, ④ review then save (and optionally send). The DocumentEditor is kept for
 * editing existing drafts.
 */
export function CreateDocumentWizard({
  open,
  initialType,
  services,
  taxRates,
  customers,
  settings,
  taxMode,
  onClose,
}: {
  open: boolean;
  initialType: DocType;
  services: EditorService[];
  taxRates: TaxRateDTO[];
  customers: EditorCustomer[];
  settings: WizardSettings;
  taxMode: "manual" | "automatic";
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<StepId>(1);
  const [docType, setDocType] = React.useState<DocType>(initialType);

  const [customerMode, setCustomerMode] = React.useState<"existing" | "new">(customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [newCustomer, setNewCustomer] = React.useState({ name: "", email: "", phone: "" });
  const [billing, setBilling] = React.useState({ line1: "", city: "", state: "", postalCode: "", country: "US" });

  const [lines, setLines] = React.useState<LineRow[]>([blankLine()]);
  const [discountType, setDiscountType] = React.useState<"" | "PERCENT" | "FIXED">("");
  const [discountValue, setDiscountValue] = React.useState("");
  const [deposit, setDeposit] = React.useState("");
  const [notes, setNotes] = React.useState(settings.defaultNotes ?? "");
  const [terms, setTerms] = React.useState(settings.defaultTerms ?? "");
  const [issueDate, setIssueDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currency = settings.currency ?? "usd";
  const taxById = React.useMemo(() => new Map(taxRates.map((t) => [t.id, t])), [taxRates]);

  // Reset to a clean slate whenever the modal (re)opens for a given type.
  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setDocType(initialType);
    setCustomerMode(customers.length ? "existing" : "new");
    setCustomerId("");
    setCustomerSearch("");
    setNewCustomer({ name: "", email: "", phone: "" });
    setBilling({ line1: "", city: "", state: "", postalCode: "", country: "US" });
    setLines([blankLine()]);
    setDiscountType("");
    setDiscountValue("");
    setDeposit("");
    setNotes(settings.defaultNotes ?? "");
    setTerms(settings.defaultTerms ?? "");
    setIssueDate("");
    setDueDate("");
    setExpiresAt("");
    setError(null);
    setBusy(false);
  }, [open, initialType, customers.length, settings.defaultNotes, settings.defaultTerms]);

  function setLine(key: string, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function pickService(key: string, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return setLine(key, { serviceId: null });
    setLine(key, { serviceId: svc.id, description: svc.title + (svc.description ? ` — ${svc.description}` : ""), unit: svc.price != null ? toDollars(svc.price) : "" });
  }
  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    const b = c?.billingAddress;
    if (b) setBilling({ line1: b.line1 ?? "", city: b.city ?? "", state: b.state ?? "", postalCode: b.postalCode ?? "", country: b.country ?? "US" });
  }

  const totals = React.useMemo(() => {
    const li: LineInput[] = lines.map((l) => {
      const rate = l.taxRateId ? taxById.get(l.taxRateId) : undefined;
      return {
        quantity: l.quantity || 0,
        unitAmount: toCents(l.unit),
        discountType: l.discountType || null,
        discountValue: l.discountType === "PERCENT" ? Math.round((parseFloat(l.discountValue) || 0) * 100) : toCents(l.discountValue),
        taxRateBps: rate?.rateBps ?? 0,
        taxInclusive: rate?.inclusive ?? false,
      };
    });
    return computeTotals(li, { type: discountType || null, value: discountType === "PERCENT" ? Math.round((parseFloat(discountValue) || 0) * 100) : toCents(discountValue) });
  }, [lines, discountType, discountValue, taxById]);

  const filledLines = lines.filter((l) => l.description.trim());
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) => `${c.name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(customerSearch.trim().toLowerCase()))
    : customers;

  function stepValid(s: StepId): string | null {
    if (s === 1) {
      if (customerMode === "existing" && !customerId) return "Pick a customer, or add a new one.";
      if (customerMode === "new" && !newCustomer.name.trim()) return "Enter the customer's name.";
      if (taxMode === "automatic" && !(billing.line1 && (billing.postalCode || billing.state))) return "Automatic tax needs a billing address (street + ZIP or state).";
    }
    if (s === 2 && filledLines.length === 0) return "Add at least one line item.";
    return null;
  }

  function next() {
    const err = stepValid(step);
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(4, (s + 1)) as StepId);
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(1, (s - 1)) as StepId);
  }

  async function submit(sendAfter: boolean) {
    for (const s of [1, 2] as StepId[]) {
      const err = stepValid(s);
      if (err) {
        setStep(s);
        return setError(err);
      }
    }
    setBusy(true);
    setError(null);
    const hasBilling = Boolean(billing.line1 || billing.postalCode || billing.state);
    const payload = {
      docType,
      customerId: customerMode === "existing" ? customerId : null,
      customer: customerMode === "new" ? newCustomer : undefined,
      customerAddress: hasBilling ? billing : undefined,
      currency,
      lineItems: filledLines.map((l) => ({
        serviceId: l.serviceId,
        description: l.description.trim(),
        quantity: l.quantity || 1,
        unitAmount: toCents(l.unit),
        discountType: l.discountType || null,
        discountValue: l.discountType === "PERCENT" ? Math.round((parseFloat(l.discountValue) || 0) * 100) : toCents(l.discountValue),
        taxRateId: l.taxRateId || null,
      })),
      discountType: discountType || null,
      discountValue: discountType === "PERCENT" ? Math.round((parseFloat(discountValue) || 0) * 100) : toCents(discountValue),
      depositAmount: toCents(deposit),
      notes: notes || null,
      terms: terms || null,
      issueDate: issueDate || null,
      dueDate: dueDate || null,
      expiresAt: expiresAt || null,
    };
    try {
      const res = await fetch("/api/v1/client/finance/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const msg: Record<string, string> = {
          invoice_limit_reached: "You've reached this month's invoice limit. It resets on the 1st — or upgrade for more.",
          tier_required: "Invoices are available on the Automate plan.",
        };
        throw new Error(msg[data?.error ?? ""] ?? data?.error ?? `Failed (${res.status})`);
      }
      const { document } = (await res.json()) as { document: DocumentDTO };
      if (sendAfter) {
        await fetch(`/api/v1/client/finance/documents/${document.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) });
      }
      router.push(`/client/invoices/${document.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header + stepper */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="font-display text-xl text-stone-900">New {DOC_LABEL[docType].toLowerCase()}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex items-center gap-1 border-b border-stone-100 px-6 py-3">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={cn("flex items-center gap-2", step >= s.id ? "text-stone-900" : "text-stone-400")}>
                <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-bold", step > s.id ? "bg-green-500 text-white" : step === s.id ? "bg-amber-400 text-stone-950" : "bg-stone-100 text-stone-400")}>
                  {step > s.id ? <Check size={13} /> : s.id}
                </span>
                <span className="text-sm font-medium">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("mx-1 h-px flex-1", step > s.id ? "bg-green-300" : "bg-stone-200")} />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-stone-700">Document type</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["INVOICE", "ESTIMATE", "QUOTE"] as DocType[]).map((t) => {
                    const Icon = DOC_ICON[t];
                    return (
                      <button key={t} onClick={() => setDocType(t)} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition", docType === t ? "border-amber-400 bg-amber-50 text-stone-900 ring-1 ring-amber-300" : "border-stone-200 text-stone-600 hover:bg-stone-50")}>
                        <Icon size={18} /> {DOC_LABEL[t]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-stone-700">Bill to</p>
                  <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-xs">
                    {(["existing", "new"] as const).map((m) => (
                      <button key={m} onClick={() => setCustomerMode(m)} className={cn("rounded-md px-2.5 py-1 font-medium", customerMode === m ? "bg-stone-900 text-white" : "text-stone-500")}>
                        {m === "existing" ? "Existing customer" : "New customer"}
                      </button>
                    ))}
                  </div>
                </div>

                {customerMode === "existing" ? (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2">
                      <Search size={15} className="text-stone-400" />
                      <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customers…" className="w-full bg-transparent text-sm focus:outline-none" />
                    </div>
                    <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-1 py-3 text-sm text-stone-400">No customers match. Switch to “New customer” to add one.</p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button key={c.id} onClick={() => pickCustomer(c.id)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition", customerId === c.id ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:bg-stone-50")}>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-stone-900">{c.name ?? "Unnamed"}</span>
                              <span className="block truncate text-xs text-stone-500">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                            </span>
                            {customerId === c.id && <Check size={16} className="shrink-0 text-amber-600" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Input placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                    <Input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                    <Input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                  </div>
                )}

                <div className="mt-3">
                  <p className="text-xs font-medium text-stone-500">Billing address{taxMode === "automatic" ? " (required for tax)" : " (optional)"}</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-6">
                    <Input placeholder="Street" value={billing.line1} onChange={(e) => setBilling({ ...billing, line1: e.target.value })} className="sm:col-span-3" />
                    <Input placeholder="City" value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} className="sm:col-span-1" />
                    <Input placeholder="State" value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value.toUpperCase().slice(0, 2) })} className="sm:col-span-1" />
                    <Input placeholder="ZIP" value={billing.postalCode} onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })} className="sm:col-span-1" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {lines.map((l) => {
                const lineCents = Math.max(0, Math.round((l.quantity || 0) * toCents(l.unit)));
                return (
                  <div key={l.key} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex flex-wrap gap-2">
                      {services.length > 0 && (
                        <select value={l.serviceId ?? ""} onChange={(e) => pickService(l.key, e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-600">
                          <option value="">From catalog…</option>
                          {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                      )}
                      <Input placeholder="Description" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} className="min-w-[180px] flex-1" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1 text-stone-500">Qty<Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-16" /></label>
                      <label className="flex items-center gap-1 text-stone-500">$<Input type="number" min={0} step="0.01" placeholder="0.00" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} className="w-24" /></label>
                      <select value={l.discountType} onChange={(e) => setLine(l.key, { discountType: e.target.value as LineRow["discountType"], discountValue: "" })} className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-600">
                        <option value="">No disc.</option><option value="PERCENT">% off</option><option value="FIXED">$ off</option>
                      </select>
                      {l.discountType && <Input type="number" min={0} step="0.01" value={l.discountValue} onChange={(e) => setLine(l.key, { discountValue: e.target.value })} className="w-20" placeholder={l.discountType === "PERCENT" ? "%" : "$"} />}
                      {taxMode !== "automatic" && taxRates.length > 0 && (
                        <select value={l.taxRateId} onChange={(e) => setLine(l.key, { taxRateId: e.target.value })} className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-600">
                          <option value="">No tax</option>
                          {taxRates.map((t) => <option key={t.id} value={t.id}>{t.name} ({(t.rateBps / 100).toFixed(2)}%)</option>)}
                        </select>
                      )}
                      <span className="ml-auto font-medium text-stone-800">{fmt(lineCents, currency)}</span>
                      <button onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== l.key) : rows))} className="text-stone-400 hover:text-red-600" aria-label="Remove line"><Trash2 size={15} /></button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setLines((rows) => [...rows, blankLine()])} className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline"><Plus size={15} /> Add line</button>
              <div className="mt-2 flex justify-end border-t border-stone-100 pt-3 text-sm">
                <div className="w-48 space-y-1">
                  <div className="flex justify-between text-stone-500"><span>Subtotal</span><span>{fmt(totals.subtotal, currency)}</span></div>
                  {totals.tax > 0 && <div className="flex justify-between text-stone-500"><span>Tax</span><span>{fmt(totals.tax, currency)}</span></div>}
                  <div className="flex justify-between font-semibold text-stone-900"><span>Total</span><span>{taxMode === "automatic" ? `${fmt(totals.total, currency)}+` : fmt(totals.total, currency)}</span></div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <section className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-700">Overall discount</span>
                  <div className="flex items-center gap-1">
                    <select value={discountType} onChange={(e) => { setDiscountType(e.target.value as "" | "PERCENT" | "FIXED"); setDiscountValue(""); }} className="rounded-md border border-stone-300 px-2 py-1 text-sm">
                      <option value="">None</option><option value="PERCENT">% off</option><option value="FIXED">$ off</option>
                    </select>
                    {discountType && <Input type="number" min={0} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="w-24" placeholder={discountType === "PERCENT" ? "%" : "$"} />}
                  </div>
                </div>
                {totals.discountTotal > 0 && <p className="mt-1 text-right text-xs text-stone-500">−{fmt(totals.discountTotal, currency)}</p>}
              </section>

              {docType === "INVOICE" && (
                <label className="grid gap-1 text-sm font-medium text-stone-700">
                  Deposit requested (optional)
                  <div className="flex items-center gap-1"><span className="text-stone-400">$</span><Input type="number" min={0} step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" className="w-32" /></div>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-stone-700">Issue date<Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
                {docType === "INVOICE" ? (
                  <label className="grid gap-1 text-sm font-medium text-stone-700">Due date<Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
                ) : (
                  <label className="grid gap-1 text-sm font-medium text-stone-700">Valid until<Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-stone-700">Notes<Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible to the customer." /></label>
                <label className="grid gap-1 text-sm font-medium text-stone-700">Terms<Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, policies…" /></label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 p-4">
                <p className="text-xs uppercase tracking-wide text-stone-400">Bill to</p>
                <p className="mt-1 font-medium text-stone-900">{customerMode === "existing" ? selectedCustomer?.name ?? "—" : newCustomer.name || "—"}</p>
                <p className="text-sm text-stone-500">{customerMode === "existing" ? [selectedCustomer?.email, selectedCustomer?.phone].filter(Boolean).join(" · ") : [newCustomer.email, newCustomer.phone].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-stone-200">
                <table className="w-full text-sm">
                  <tbody>
                    {filledLines.map((l) => (
                      <tr key={l.key} className="border-b border-stone-100 last:border-0">
                        <td className="px-3 py-2 text-stone-700">{l.description} <span className="text-stone-400">× {l.quantity}</span></td>
                        <td className="px-3 py-2 text-right text-stone-800">{fmt(Math.round((l.quantity || 0) * toCents(l.unit)), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <dl className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between text-stone-500"><dt>Subtotal</dt><dd>{fmt(totals.subtotal, currency)}</dd></div>
                  {totals.discountTotal > 0 && <div className="flex justify-between text-stone-500"><dt>Discount</dt><dd>−{fmt(totals.discountTotal, currency)}</dd></div>}
                  {totals.tax > 0 && <div className="flex justify-between text-stone-500"><dt>Tax</dt><dd>{fmt(totals.tax, currency)}</dd></div>}
                  <div className="flex justify-between border-t border-stone-100 pt-1 text-base font-semibold text-stone-900"><dt>Total</dt><dd>{taxMode === "automatic" ? `${fmt(totals.total, currency)}+` : fmt(totals.total, currency)}</dd></div>
                </dl>
              </div>
              <p className="text-xs text-stone-400">Save as a draft to review later, or save &amp; send to email it to the customer{taxMode === "automatic" ? " (tax is finalised on save)" : ""}.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-100 px-6 py-4">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" disabled={busy} onClick={step === 1 ? onClose : back}>
              {step === 1 ? "Cancel" : <><ArrowLeft size={16} /> Back</>}
            </Button>
            {step < 4 ? (
              <Button onClick={next}>Next <ArrowRight size={16} /></Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => submit(false)}>{busy ? "Saving…" : "Save draft"}</Button>
                <Button disabled={busy} onClick={() => submit(true)}>{busy ? "Sending…" : "Save & send"}</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
