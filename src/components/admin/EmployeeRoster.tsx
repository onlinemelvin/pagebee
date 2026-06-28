"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface EmployeeRowData {
  id: string;
  name: string;
  email: string;
  title: string | null;
  employeeType: string;
  compensationType: string;
  employmentStatus: string;
  baseSalary: number;
  hourlyRate: number;
}

const TYPES = ["SALARIED", "HOURLY", "SUPPORT_AGENT", "ADMIN", "CONTRACTOR"];
const COMP = ["SALARY", "HOURLY", "MIXED"];
const money = (n: number) => (n ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—");

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ON_LEAVE: "bg-amber-100 text-amber-700",
  TERMINATED: "bg-stone-100 text-stone-500",
};

export function EmployeeRoster({ initial }: { initial: EmployeeRowData[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    title: "",
    employeeType: "SALARIED",
    compensationType: "SALARY",
    baseSalary: "",
    hourlyRate: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          title: form.title || undefined,
          employeeType: form.employeeType,
          compensationType: form.compensationType,
          baseSalary: form.baseSalary ? Number(form.baseSalary) : undefined,
          hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error === "email_taken" ? "That email already exists." : "Could not add employee.");
        return;
      }
      setForm({ name: "", email: "", title: "", employeeType: "SALARIED", compensationType: "SALARY", baseSalary: "", hourlyRate: "" });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, employmentStatus: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{initial.length} employee{initial.length === 1 ? "" : "s"}</p>
        <Button onClick={() => setAdding((v) => !v)} variant={adding ? "ghost" : "primary"}>
          {adding ? <X size={16} /> : <UserPlus size={16} />} {adding ? "Cancel" : "Add employee"}
        </Button>
      </div>

      {adding ? (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name *"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={form.employeeType} onChange={(v) => setForm({ ...form, employeeType: v })} options={TYPES} />
            </Field>
            <Field label="Compensation">
              <Select value={form.compensationType} onChange={(v) => setForm({ ...form, compensationType: v })} options={COMP} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Base ($/period)"><Input type="number" min={0} value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} /></Field>
              <Field label="Hourly ($)"><Input type="number" min={0} value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></Field>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add employee"}</Button>
          </div>
        </form>
      ) : null}

      {initial.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <p className="text-sm text-stone-500">No employees yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium text-right">Base / Hourly</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {initial.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-stone-900">{e.name}</p>
                    <p className="text-xs text-stone-400">{e.title ?? e.email}</p>
                  </td>
                  <td className="px-5 py-3 text-stone-600">{e.employeeType.toLowerCase().replace("_", " ")}</td>
                  <td className="px-5 py-3 text-right text-stone-700">
                    {money(e.baseSalary)} {e.hourlyRate ? <span className="text-stone-400">· {money(e.hourlyRate)}/hr</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLES[e.employmentStatus] ?? "")}>
                      {e.employmentStatus.toLowerCase().replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {e.employmentStatus !== "TERMINATED" ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus(e.id, "TERMINATED")}>
                        Terminate
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus(e.id, "ACTIVE")}>
                        Reactivate
                      </Button>
                    )}
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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o.toLowerCase().replace("_", " ")}</option>
      ))}
    </select>
  );
}
