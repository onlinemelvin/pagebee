"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, UserPlus, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface RepSummaryRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  status: string;
  contractStatus: string | null;
  certified: boolean;
  prospects: number;
  conversions: number;
}

const ERROR_COPY: Record<string, string> = {
  email_taken: "A user with that email already exists.",
  validation_error: "Check the form — name, valid email, and an 8+ character password are required.",
  supabase_not_configured: "Auth isn't configured in this environment.",
  rep_has_commissions: "This rep has commission history and can't be deleted from here.",
  rep_not_found: "That rep no longer exists.",
};

export function RepRoster({ initialReps }: { initialReps: RepSummaryRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [certifying, setCertifying] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: "", email: "", title: "", password: "" });

  async function toggleCertify(id: string, certified: boolean) {
    setCertifying(id);
    try {
      const res = await fetch(`/api/v1/admin/reps/${id}/certify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certified }),
      });
      if (res.ok) router.refresh();
    } finally {
      setCertifying(null);
    }
  }

  async function removeRep(rep: RepSummaryRow) {
    const hasHistory = rep.conversions > 0;
    const warning = hasHistory
      ? `${rep.name} has ${rep.conversions} commission record(s). Deleting will also erase that financial history. This cannot be undone — continue?`
      : `Permanently delete ${rep.name}? This removes their portal login, contract, and prospect assignments. This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setRemoving(rep.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/reps/${rep.id}${hasHistory ? "?force=1" : ""}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_COPY[data.error ?? ""] ?? "Could not delete rep.");
      }
    } finally {
      setRemoving(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/admin/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_COPY[data.error ?? ""] ?? "Could not create rep.");
        return;
      }
      setDone(`${form.email} created. Share their temporary password so they can sign in and sign the agreement.`);
      setForm({ name: "", email: "", title: "", password: "" });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{initialReps.length} rep{initialReps.length === 1 ? "" : "s"}</p>
        <Button onClick={() => setAdding((v) => !v)} variant={adding ? "ghost" : "primary"}>
          {adding ? <X size={16} /> : <UserPlus size={16} />} {adding ? "Cancel" : "Add rep"}
        </Button>
      </div>

      {done ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} /> {done}
        </div>
      ) : null}

      {error && !adding ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {adding ? (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name *">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email *">
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sales rep" />
            </Field>
            <Field label="Temporary password *">
              <Input
                type="text"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="8+ characters — share with the rep"
              />
            </Field>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-stone-400">Creates a sales-portal login + a contract for the rep to e-sign.</p>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create rep"}
            </Button>
          </div>
        </form>
      ) : null}

      {initialReps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <Plus size={26} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">No reps yet. Add your first commission rep.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-5 py-3 font-medium">Rep</th>
                <th className="px-5 py-3 font-medium">Contract</th>
                <th className="px-5 py-3 font-medium">Certified</th>
                <th className="px-5 py-3 font-medium text-right">Prospects</th>
                <th className="px-5 py-3 font-medium text-right">Conversions</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {initialReps.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-stone-900">{r.name}</p>
                    <p className="text-xs text-stone-400">{r.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.contractStatus ?? "none"} />
                  </td>
                  <td className="px-5 py-3 text-stone-600">{r.certified ? "Yes" : "—"}</td>
                  <td className="px-5 py-3 text-right text-stone-700">{r.prospects}</td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-700">{r.conversions}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={certifying === r.id}
                        onClick={() => toggleCertify(r.id, !r.certified)}
                      >
                        {r.certified ? "Decertify" : "Certify"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removing === r.id}
                        onClick={() => removeRep(r)}
                        aria-label={`Delete ${r.name}`}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
