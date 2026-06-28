"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X, Building2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/toast";

export interface ProspectRow {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  updatedAt: string;
  counts: { activities: number; followUps: number; quotes: number };
}

const ERROR_COPY: Record<string, string> = {
  prospect_claimed: "Another rep already owns this business.",
  contract_required: "Your commission agreement must be active before adding prospects.",
  validation_error: "Please check the form and try again.",
  forbidden: "You don't have access to do that.",
};

export function ProspectsManager({
  initialProspects,
  canAdd,
}: {
  initialProspects: ProspectRow[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ businessName: "", contactName: "", email: "", phone: "", notes: "" });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialProspects;
    return initialProspects.filter((p) =>
      [p.businessName, p.contactName, p.email, p.phone].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [query, initialProspects]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/rep/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_COPY[data.error ?? ""] ?? "Could not add prospect.");
        return;
      }
      setForm({ businessName: "", contactName: "", email: "", phone: "", notes: "" });
      setAdding(false);
      toast.success(`${form.businessName} added to your pipeline`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prospects…"
            className="pl-9"
          />
        </div>
        {canAdd ? (
          <Button onClick={() => setAdding((v) => !v)} variant={adding ? "ghost" : "primary"}>
            {adding ? <X size={16} /> : <Plus size={16} />} {adding ? "Cancel" : "Add prospect"}
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name *">
              <Input
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="Joe's Pizza"
              />
            </Field>
            <Field label="Contact name">
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy || !form.businessName.trim()}>
              {busy ? "Adding…" : "Add prospect"}
            </Button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <Building2 size={28} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">
            {initialProspects.length === 0 ? "No prospects yet. Add your first one." : "No matches."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/rep/prospects/${p.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900">{p.businessName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-400">
                    {p.contactName ? <span>{p.contactName}</span> : null}
                    {p.email ? (
                      <span className="flex items-center gap-1">
                        <Mail size={11} /> {p.email}
                      </span>
                    ) : null}
                    {p.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {p.phone}
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="hidden text-xs text-stone-400 sm:inline">
                  {p.counts.activities} activities · {p.counts.quotes} quotes
                </span>
                <StatusBadge status={p.status} />
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
