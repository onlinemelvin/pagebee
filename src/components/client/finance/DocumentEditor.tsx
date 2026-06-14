"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { computeTotals, type LineInput } from "@/lib/modules/finance/money";
import { fmt, toCents, toDollars } from "./money-format";
import type { DocumentDTO, DocType, TaxRateDTO } from "@/lib/modules/finance";

export interface EditorService {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  durationMinutes: number;
}
export interface EditorBillingAddress {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}
export interface EditorCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  billingAddress?: EditorBillingAddress | null;
}
export interface EditorSettings {
  currency: string;
  defaultTerms: string;
  defaultNotes: string;
}

interface LineRow {
  key: string;
  serviceId: string | null;
  description: string;
  quantity: number;
  unit: string; // dollars
  discountType: "" | "PERCENT" | "FIXED";
  discountValue: string; // percent or dollars
  taxRateId: string;
}

const DOC_LABEL: Record<DocType, string> = { ESTIMATE: "Estimate", QUOTE: "Quote", INVOICE: "Invoice" };
let kc = 0;
const newKey = () => `l${kc++}`;

function blankLine(): LineRow {
  return { key: newKey(), serviceId: null, description: "", quantity: 1, unit: "", discountType: "", discountValue: "", taxRateId: "" };
}

export function DocumentEditor({
  docType,
  initial,
  services,
  taxRates,
  customers,
  settings,
  taxMode = "manual",
}: {
  docType: DocType;
  initial?: DocumentDTO | null;
  services: EditorService[];
  taxRates: TaxRateDTO[];
  customers: EditorCustomer[];
  settings: EditorSettings;
  taxMode?: "manual" | "automatic";
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const dt = (initial?.docType ?? docType) as DocType;

  const [customerMode, setCustomerMode] = React.useState<"existing" | "new">(initial?.customerId ? "existing" : customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = React.useState(initial?.customerId ?? "");
  const [newCustomer, setNewCustomer] = React.useState({ name: "", email: "", phone: "" });
  const [billing, setBilling] = React.useState(() => {
    const c = initial?.customerId ? customers.find((x) => x.id === initial.customerId) : null;
    const b = c?.billingAddress ?? {};
    return { line1: b.line1 ?? "", city: b.city ?? "", state: b.state ?? "", postalCode: b.postalCode ?? "", country: b.country ?? "US" };
  });
  // When picking an existing customer, prefill their saved billing address.
  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c?.billingAddress) {
      const b = c.billingAddress;
      setBilling({ line1: b.line1 ?? "", city: b.city ?? "", state: b.state ?? "", postalCode: b.postalCode ?? "", country: b.country ?? "US" });
    }
  }

  const [lines, setLines] = React.useState<LineRow[]>(() =>
    initial
      ? initial.lineItems.map((l) => ({
          key: newKey(),
          serviceId: l.serviceId,
          description: l.description,
          quantity: l.quantity,
          unit: toDollars(l.unitAmount),
          discountType: (l.discountType ?? "") as LineRow["discountType"],
          discountValue: l.discountType === "PERCENT" ? String(l.discountValue / 100) : l.discountType === "FIXED" ? toDollars(l.discountValue) : "",
          taxRateId: l.taxRateId ?? "",
        }))
      : [blankLine()],
  );

  const [discountType, setDiscountType] = React.useState<"" | "PERCENT" | "FIXED">((initial?.discountType ?? "") as "" | "PERCENT" | "FIXED");
  const [discountValue, setDiscountValue] = React.useState(
    initial?.discountType === "PERCENT" ? String(initial.discountValue / 100) : initial?.discountType === "FIXED" ? toDollars(initial.discountValue) : "",
  );
  const [deposit, setDeposit] = React.useState(initial ? toDollars(initial.depositAmount) : "");
  const [notes, setNotes] = React.useState(initial?.notes ?? settings.defaultNotes ?? "");
  const [terms, setTerms] = React.useState(initial?.terms ?? settings.defaultTerms ?? "");
  const [issueDate, setIssueDate] = React.useState(initial?.issueDate?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = React.useState(initial?.dueDate?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = React.useState(initial?.expiresAt?.slice(0, 10) ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const taxById = React.useMemo(() => new Map(taxRates.map((t) => [t.id, t])), [taxRates]);
  const currency = initial?.currency ?? settings.currency ?? "usd";

  function setLine(key: string, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function pickService(key: string, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) {
      setLine(key, { serviceId: null });
      return;
    }
    setLine(key, {
      serviceId: svc.id,
      description: svc.title + (svc.description ? ` — ${svc.description}` : ""),
      unit: svc.price != null ? toDollars(svc.price) : "",
    });
  }

  // Live totals (mirror the server's money math).
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
    return computeTotals(li, {
      type: discountType || null,
      value: discountType === "PERCENT" ? Math.round((parseFloat(discountValue) || 0) * 100) : toCents(discountValue),
    });
  }, [lines, discountType, discountValue, taxById]);

  async function save(sendAfter = false) {
    setError(null);
    if (customerMode === "existing" && !customerId) {
      setError("Pick a customer, or add a new one.");
      return;
    }
    if (customerMode === "new" && !newCustomer.name.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    if (lines.every((l) => !l.description.trim())) {
      setError("Add at least one line item.");
      return;
    }
    if (taxMode === "automatic" && !(billing.line1 && (billing.postalCode || billing.state))) {
      setError("Automatic tax needs the customer's billing address (at least street + ZIP).");
      return;
    }
    setBusy(true);
    const hasBilling = Boolean(billing.line1 || billing.postalCode || billing.state);
    const payload = {
      docType: dt,
      customerId: customerMode === "existing" ? customerId : null,
      customer: customerMode === "new" ? newCustomer : undefined,
      customerAddress: hasBilling ? billing : undefined,
      currency,
      lineItems: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
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
      const res = await fetch(isEdit ? `/api/v1/client/finance/documents/${initial!.id}` : "/api/v1/client/finance/documents", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
        await fetch(`/api/v1/client/finance/documents/${document.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send" }),
        });
      }
      router.push(`/client/invoices/${document.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  const showExpiry = dt !== "INVOICE";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main */}
      <div className="space-y-6">
        {/* Customer */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-stone-900">Bill to</h2>
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-xs">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCustomerMode(m)}
                  className={cn("rounded-md px-2.5 py-1 font-medium capitalize", customerMode === m ? "bg-stone-900 text-white" : "text-stone-500")}
                >
                  {m === "existing" ? "Existing" : "New"}
                </button>
              ))}
            </div>
          </div>
          {customerMode === "existing" ? (
            <select
              value={customerId}
              onChange={(e) => pickCustomer(e.target.value)}
              className="mt-3 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed"} {c.email ? `· ${c.email}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Input placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <Input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
              <Input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            </div>
          )}

          {/* Billing address (required for automatic tax; optional otherwise) */}
          <div className="mt-3">
            <p className="text-xs font-medium text-stone-500">Billing address{taxMode === "automatic" ? " (required for tax)" : " (optional)"}</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-6">
              <Input placeholder="Street" value={billing.line1} onChange={(e) => setBilling({ ...billing, line1: e.target.value })} className="sm:col-span-3" />
              <Input placeholder="City" value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} className="sm:col-span-1" />
              <Input placeholder="State" value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value.toUpperCase().slice(0, 2) })} className="sm:col-span-1" />
              <Input placeholder="ZIP" value={billing.postalCode} onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })} className="sm:col-span-1" />
            </div>
          </div>
        </section>

        {/* Line items */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-medium text-stone-900">Items</h2>
          <div className="mt-3 space-y-3">
            {lines.map((l) => {
              const rate = l.taxRateId ? taxById.get(l.taxRateId) : undefined;
              const lineCents = Math.max(0, Math.round((l.quantity || 0) * toCents(l.unit)));
              return (
                <div key={l.key} className="rounded-xl border border-stone-200 p-3">
                  <div className="flex items-start gap-2">
                    <GripVertical size={16} className="mt-2 shrink-0 text-stone-300" />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {services.length > 0 && (
                          <select
                            value={l.serviceId ?? ""}
                            onChange={(e) => pickService(l.key, e.target.value)}
                            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-600"
                          >
                            <option value="">From catalog…</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        )}
                        <Input
                          placeholder="Description"
                          value={l.description}
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                          className="min-w-[180px] flex-1"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex items-center gap-1 text-stone-500">
                          Qty
                          <Input
                            type="number"
                            min={1}
                            value={l.quantity}
                            onChange={(e) => setLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-16"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-stone-500">
                          $
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={l.unit}
                            onChange={(e) => setLine(l.key, { unit: e.target.value })}
                            className="w-24"
                          />
                        </label>
                        <select
                          value={l.discountType}
                          onChange={(e) => setLine(l.key, { discountType: e.target.value as LineRow["discountType"], discountValue: "" })}
                          className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-600"
                        >
                          <option value="">No disc.</option>
                          <option value="PERCENT">% off</option>
                          <option value="FIXED">$ off</option>
                        </select>
                        {l.discountType && (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.discountValue}
                            onChange={(e) => setLine(l.key, { discountValue: e.target.value })}
                            className="w-20"
                            placeholder={l.discountType === "PERCENT" ? "%" : "$"}
                          />
                        )}
                        {taxMode !== "automatic" && taxRates.length > 0 && (
                          <select
                            value={l.taxRateId}
                            onChange={(e) => setLine(l.key, { taxRateId: e.target.value })}
                            className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-600"
                          >
                            <option value="">No tax</option>
                            {taxRates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({(t.rateBps / 100).toFixed(2)}%)
                              </option>
                            ))}
                          </select>
                        )}
                        <span className="ml-auto font-medium text-stone-800">{fmt(lineCents, currency)}</span>
                        <button onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== l.key) : rows))} className="text-stone-400 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {rate && <p className="text-xs text-stone-400">{rate.name} {rate.inclusive ? "(incl.)" : "(added)"}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => setLines((rows) => [...rows, blankLine()])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline">
            <Plus size={15} /> Add line
          </button>
        </section>

        {/* Notes & terms */}
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Notes
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible to the customer." />
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Terms
            <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, policies…" />
          </label>
        </section>
      </div>

      {/* Sidebar: totals + meta */}
      <aside className="space-y-4">
        <div className="sticky top-4 space-y-4">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-medium text-stone-900">Summary</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd>{fmt(totals.subtotal, currency)}</dd></div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-stone-500">Discount</dt>
                <dd className="flex items-center gap-1">
                  <select value={discountType} onChange={(e) => { setDiscountType(e.target.value as "" | "PERCENT" | "FIXED"); setDiscountValue(""); }} className="rounded-md border border-stone-300 px-1 py-0.5 text-xs">
                    <option value="">—</option>
                    <option value="PERCENT">%</option>
                    <option value="FIXED">$</option>
                  </select>
                  {discountType && <Input type="number" min={0} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-7 w-16 text-xs" />}
                  <span className="w-16 text-right text-stone-600">−{fmt(totals.discountTotal, currency)}</span>
                </dd>
              </div>
              {taxMode === "automatic" ? (
                <div className="flex justify-between text-stone-400"><dt>Tax</dt><dd>calculated on save</dd></div>
              ) : (
                totals.tax > 0 && <div className="flex justify-between"><dt className="text-stone-500">Tax</dt><dd>{fmt(totals.tax, currency)}</dd></div>
              )}
              <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold text-stone-900"><dt>Total</dt><dd>{taxMode === "automatic" ? `${fmt(totals.total, currency)}+` : fmt(totals.total, currency)}</dd></div>
            </dl>
            <label className="mt-3 grid gap-1 text-sm font-medium text-stone-700">
              Deposit requested (optional)
              <div className="flex items-center gap-1"><span className="text-stone-400">$</span><Input type="number" min={0} step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" /></div>
            </label>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-medium text-stone-900">Dates</h2>
            <div className="mt-3 space-y-2 text-sm">
              <label className="grid gap-1 font-medium text-stone-700">Issue date<Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
              {dt === "INVOICE" ? (
                <label className="grid gap-1 font-medium text-stone-700">Due date<Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
              ) : (
                showExpiry && <label className="grid gap-1 font-medium text-stone-700">Valid until<Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
              )}
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-2">
            <Button disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : isEdit ? "Save changes" : `Save ${DOC_LABEL[dt]}`}</Button>
            {!isEdit && <Button variant="outline" disabled={busy} onClick={() => save(true)}>Save &amp; send</Button>}
            <Button variant="ghost" disabled={busy} onClick={() => router.back()}>Cancel</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
