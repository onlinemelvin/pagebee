"use client";

import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  X,
  Search,
  Mail,
  Phone,
  Building2,
  Globe,
  GitMerge,
  Tag as TagIcon,
  Inbox,
  FileText,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerDTO, CustomField } from "@/lib/modules/customer";

type Counts = { active: number; archived: number };

interface FormState {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  note: string;
  tags: string[];
  customFields: CustomField[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  phone: "",
  email: "",
  company: "",
  address: "",
  note: "",
  tags: [],
  customFields: [],
};

function fromDTO(c: CustomerDTO): FormState {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    company: c.company ?? "",
    address: c.address ?? "",
    note: c.note ?? "",
    tags: [...c.tags],
    customFields: c.customFields.map((f) => ({ ...f })),
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function CustomersManager({
  initialCustomers,
  initialCounts,
}: {
  initialCustomers: CustomerDTO[];
  initialCounts: Counts;
}) {
  const [rows, setRows] = React.useState<CustomerDTO[]>(initialCustomers);
  const [counts, setCounts] = React.useState<Counts>(initialCounts);
  const [search, setSearch] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<CustomerDTO | null>(null);
  const [mergeMode, setMergeMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mergePair, setMergePair] = React.useState<{ a: CustomerDTO; b: CustomerDTO } | null>(null);

  // Fetch the list for the current search + archive filter. Used on every change and after a mutation
  // (instead of router.refresh, so the owner's search/scroll position survives the update).
  const reload = React.useCallback(async (q: string, archived: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (archived) params.set("archived", "1");
      const res = await fetch(`/api/v1/client/customers?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { customers: CustomerDTO[]; counts: Counts };
        setRows(data.customers);
        setCounts(data.counts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search; refetch when the archive toggle flips.
  React.useEffect(() => {
    const t = setTimeout(() => void reload(search, showArchived), 250);
    return () => clearTimeout(t);
  }, [search, showArchived, reload]);

  function refresh() {
    void reload(search, showArchived);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startMerge() {
    const picked = rows.filter((r) => selected.has(r.id));
    if (picked.length === 2) setMergePair({ a: picked[0], b: picked[1] });
  }

  async function archive(c: CustomerDTO, archived: boolean) {
    await fetch(`/api/v1/client/customers/${c.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    refresh();
  }

  return (
    <div className="mt-6">
      {/* Toolbar: search · archived toggle · merge · add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-card sm:w-72">
          <Search size={16} className="shrink-0 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
            aria-label="Search customers"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-stone-400 hover:text-stone-600" aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-0.5 shadow-card">
          <button
            onClick={() => setShowArchived(false)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              !showArchived ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            Active {counts.active > 0 && <span className="opacity-70">· {counts.active}</span>}
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              showArchived ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            Archived {counts.archived > 0 && <span className="opacity-70">· {counts.archived}</span>}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={mergeMode ? "dark" : "outline"}
            onClick={() => {
              setMergeMode((m) => !m);
              setSelected(new Set());
            }}
            title="Combine two duplicate customers into one"
          >
            <GitMerge size={16} /> {mergeMode ? "Cancel merge" : "Merge"}
          </Button>
          <Button onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus size={16} /> Add customer
          </Button>
        </div>
      </div>

      {/* Merge helper bar */}
      {mergeMode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <GitMerge size={16} className="shrink-0" />
          <span>Pick the <strong>two</strong> records that are the same person, then merge them into one.</span>
          <Button size="sm" className="ml-auto" disabled={selected.size !== 2} onClick={startMerge}>
            Merge {selected.size} selected
          </Button>
        </div>
      )}

      {/* List */}
      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState archived={showArchived} loading={loading} onAdd={() => setForm({ ...EMPTY_FORM })} />
        ) : (
          <ul className="grid gap-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "group flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover",
                  selected.has(c.id) ? "border-amber-400 ring-1 ring-amber-300" : "border-stone-200",
                )}
              >
                {mergeMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelected(c.id)}
                    className="h-5 w-5 shrink-0 rounded border-stone-300 accent-amber-500"
                    aria-label={`Select ${c.name}`}
                  />
                )}

                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">
                  {initials(c.name)}
                </span>

                <button
                  onClick={() => !mergeMode && setForm(fromDTO(c))}
                  className="min-w-0 flex-1 text-left"
                  disabled={mergeMode}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-stone-900">{c.name}</span>
                    {c.company && (
                      <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                        <Building2 size={12} /> {c.company}
                      </span>
                    )}
                    {c.source === "website" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        <Globe size={11} /> From website
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-stone-500">
                    {c.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail size={13} className="text-stone-400" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone size={13} className="text-stone-400" /> {c.phone}
                      </span>
                    )}
                    {!c.email && !c.phone && <span className="text-stone-400">No contact details</span>}
                  </div>
                  {(c.tags.length > 0 || c.counts.leads > 0 || c.counts.invoices > 0 || c.counts.bookings > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {c.tags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                          <TagIcon size={10} /> {t}
                        </span>
                      ))}
                      {c.counts.leads > 0 && <Stat icon={<Inbox size={11} />} n={c.counts.leads} label="inquiries" />}
                      {c.counts.invoices > 0 && <Stat icon={<FileText size={11} />} n={c.counts.invoices} label="invoices" />}
                      {c.counts.bookings > 0 && <Stat icon={<CalendarCheck size={11} />} n={c.counts.bookings} label="appointments" />}
                    </div>
                  )}
                </button>

                {!mergeMode && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn title="Edit" onClick={() => setForm(fromDTO(c))}>
                      <Pencil size={16} />
                    </IconBtn>
                    {c.archived ? (
                      <IconBtn title="Restore" onClick={() => archive(c, false)}>
                        <ArchiveRestore size={16} />
                      </IconBtn>
                    ) : (
                      <IconBtn title="Archive" onClick={() => archive(c, true)}>
                        <Archive size={16} />
                      </IconBtn>
                    )}
                    <IconBtn title="Delete" danger onClick={() => setConfirmDelete(c)}>
                      <Trash2 size={16} />
                    </IconBtn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {form && (
        <CustomerFormModal
          form={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}

      {confirmDelete && (
        <DeleteModal
          customer={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDone={() => {
            setConfirmDelete(null);
            refresh();
          }}
          onArchiveInstead={async () => {
            await archive(confirmDelete, true);
            setConfirmDelete(null);
          }}
        />
      )}

      {mergePair && (
        <MergeModal
          pair={mergePair}
          onClose={() => setMergePair(null)}
          onDone={() => {
            setMergePair(null);
            setMergeMode(false);
            setSelected(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
      {icon}
      {n} {label}
    </span>
  );
}

function IconBtn({
  children,
  title,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100",
        danger && "hover:bg-red-50 hover:text-red-600",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ archived, loading, onAdd }: { archived: boolean; loading: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/50 px-6 py-14 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-amber-500 shadow-sm">
        <Plus size={22} />
      </span>
      <p className="mt-4 font-medium text-stone-700">
        {loading ? "Loading…" : archived ? "No archived customers" : "No customers yet"}
      </p>
      {!archived && !loading && (
        <>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            Add your first customer, or they&apos;ll appear here automatically when someone fills in your
            website&apos;s contact form.
          </p>
          <Button className="mt-5" onClick={onAdd}>
            <Plus size={16} /> Add customer
          </Button>
        </>
      )}
    </div>
  );
}

// ── Add / edit ────────────────────────────────────────────────────────────────
function CustomerFormModal({ form, onClose, onSaved }: { form: FormState; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = React.useState<FormState>(form);
  const [tagDraft, setTagDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function addTag() {
    const t = tagDraft.trim();
    if (t && !state.tags.includes(t)) set("tags", [...state.tags, t]);
    setTagDraft("");
  }

  function addField() {
    set("customFields", [...state.customFields, { label: "", value: "" }]);
  }
  function updateField(i: number, patch: Partial<CustomField>) {
    set(
      "customFields",
      state.customFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    );
  }
  function removeField(i: number) {
    set("customFields", state.customFields.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!state.name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: state.name.trim(),
      phone: state.phone.trim(),
      email: state.email.trim(),
      company: state.company.trim(),
      address: state.address.trim(),
      note: state.note.trim(),
      tags: state.tags,
      // Drop blank custom-field rows before saving.
      customFields: state.customFields.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), value: f.value.trim() })),
    };
    try {
      const res = await fetch(state.id ? `/api/v1/client/customers/${state.id}` : "/api/v1/client/customers", {
        method: state.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error === "validation_error" ? "Please check the details and try again." : data?.error ?? `Failed (${res.status})`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={() => !busy && onClose()} title={state.id ? "Edit customer" : "Add a customer"}>
      <div className="mt-4 grid gap-3">
        <Field label="Name" required>
          <Input value={state.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Maria Gonzalez" autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={state.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" value={state.email} onChange={(e) => set("email", e.target.value)} placeholder="maria@example.com" />
          </Field>
        </div>
        <Field label="Company (optional)">
          <Input value={state.company} onChange={(e) => set("company", e.target.value)} placeholder="For business or fleet accounts" />
        </Field>
        <Field label="Address (optional)">
          <Input value={state.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, state" />
        </Field>

        {/* Tags */}
        <Field label="Tags (optional)">
          <div className="rounded-xl border border-stone-300 bg-white px-2 py-2">
            {state.tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {state.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                    {t}
                    <button onClick={() => set("tags", state.tags.filter((x) => x !== t))} className="text-stone-400 hover:text-stone-700" aria-label={`Remove ${t}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Type a tag (e.g. VIP) and press Enter"
              className="w-full bg-transparent px-1 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
            />
          </div>
        </Field>

        {/* Custom fields */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">Custom details (optional)</span>
            <button onClick={addField} className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">
              <Plus size={14} /> Add field
            </button>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">Anything you want to remember — vehicle &amp; plate, preferred stylist, gate code…</p>
          {state.customFields.length > 0 && (
            <div className="mt-2 grid gap-2">
              {state.customFields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="Label" className="w-2/5" />
                  <Input value={f.value} onChange={(e) => updateField(i, { value: e.target.value })} placeholder="Value" className="flex-1" />
                  <button onClick={() => removeField(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove field">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={state.note}
            onChange={(e) => set("note", e.target.value)}
            rows={3}
            placeholder="Anything helpful about this customer…"
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : state.id ? "Save changes" : "Add customer"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Delete ──────────────────────────────────────────────────────────────────
function DeleteModal({
  customer,
  onClose,
  onDone,
  onArchiveInstead,
}: {
  customer: CustomerDTO;
  onClose: () => void;
  onDone: () => void;
  onArchiveInstead: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);

  async function del() {
    setBusy(true);
    const res = await fetch(`/api/v1/client/customers/${customer.id}`, { method: "DELETE" });
    if (res.ok) {
      onDone();
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 409 || data?.error === "has_financial_records") setBlocked(true);
    setBusy(false);
  }

  return (
    <Modal onClose={() => !busy && onClose()} title="Delete customer" small>
      {blocked ? (
        <>
          <p className="mt-3 text-sm text-stone-600">
            <strong>{customer.name}</strong> has invoices or payments on record, so they can&apos;t be deleted —
            this protects your financial history. You can archive them instead to hide them from your active list.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onArchiveInstead}>
              <Archive size={16} /> Archive instead
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-stone-600">
            Permanently delete <strong>{customer.name}</strong>? This can&apos;t be undone. Their inquiries and
            appointments will be kept but unlinked. To keep their history, archive them instead.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
            <button
              onClick={del}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={16} /> {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Merge ─────────────────────────────────────────────────────────────────────
function MergeModal({
  pair,
  onClose,
  onDone,
}: {
  pair: { a: CustomerDTO; b: CustomerDTO };
  onClose: () => void;
  onDone: () => void;
}) {
  const [primaryId, setPrimaryId] = React.useState(pair.a.id);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const duplicate = primaryId === pair.a.id ? pair.b : pair.a;

  async function merge() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/client/customers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId, duplicateId: duplicate.id }),
    });
    if (res.ok) {
      onDone();
      return;
    }
    setError("Couldn't merge these customers. Please try again.");
    setBusy(false);
  }

  return (
    <Modal onClose={() => !busy && onClose()} title="Merge customers">
      <p className="mt-2 text-sm text-stone-600">
        Choose which record to keep. The other&apos;s history (inquiries, appointments, invoices) moves onto it,
        and any details it&apos;s missing are filled in. The duplicate is then deleted.
      </p>
      <div className="mt-4 grid gap-2">
        {[pair.a, pair.b].map((c) => (
          <label
            key={c.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
              primaryId === c.id ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-stone-200 hover:bg-stone-50",
            )}
          >
            <input type="radio" name="primary" checked={primaryId === c.id} onChange={() => setPrimaryId(c.id)} className="h-4 w-4 accent-amber-500" />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{initials(c.name)}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-stone-900">
                {c.name} {primaryId === c.id && <span className="ml-1 text-xs font-medium text-amber-700">· keep this one</span>}
              </p>
              <p className="truncate text-xs text-stone-500">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
            </div>
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={merge}>
          <GitMerge size={16} /> {busy ? "Merging…" : "Merge"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, small }: { children: React.ReactNode; onClose: () => void; title: string; small?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl", small ? "max-w-md" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-stone-900">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-700">
      <span>
        {label}
        {required && <span className="text-amber-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
