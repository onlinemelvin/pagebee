"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Check, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PayrollRecordData {
  id: string;
  employeeName: string;
  employeeType: string;
  hourlyRate: number;
  status: string;
  grossSalary: number;
  hoursWorked: number;
  hourlyPay: number;
  commissionPay: number;
  bonus: number;
  deductions: number;
  reimbursements: number;
  netPay: number;
}
export interface PayPeriodData {
  id: string;
  label: string;
  status: string;
  startDate: string;
  endDate: string;
  totals: { gross: number; net: number };
  records: PayrollRecordData[];
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PayrollDetail({ period }: { period: PayPeriodData }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const draft = period.status === "DRAFT";

  async function action(action: "generate" | "approve" | "pay") {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/payroll/periods/${period.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> All periods
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">{period.label}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {date(period.startDate)} – {date(period.endDate)} ·{" "}
            <span className="capitalize">{period.status.toLowerCase()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draft ? (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => action("generate")}>
                <RefreshCw size={14} /> Generate records
              </Button>
              {period.records.length > 0 ? (
                <Button size="sm" disabled={busy} onClick={() => action("approve")}>
                  <Check size={14} /> Approve
                </Button>
              ) : null}
            </>
          ) : null}
          {period.status === "APPROVED" ? (
            <Button size="sm" disabled={busy} onClick={() => action("pay")}>
              <Banknote size={14} /> Mark paid
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Summary label="Gross" value={money(period.totals.gross)} />
        <Summary label="Net pay" value={money(period.totals.net)} />
      </div>

      {period.records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <p className="text-sm text-stone-500">No records. Generate them from active employees to begin.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium text-right">Gross</th>
                <th className="px-4 py-3 font-medium text-right">Hours</th>
                <th className="px-4 py-3 font-medium text-right">Bonus</th>
                <th className="px-4 py-3 font-medium text-right">Deductions</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
                {draft ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {period.records.map((r) => (
                <RecordRow key={r.id} record={r} editable={draft} onSaved={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecordRow({ record, editable, onSaved }: { record: PayrollRecordData; editable: boolean; onSaved: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({
    grossSalary: String(record.grossSalary),
    hoursWorked: String(record.hoursWorked),
    bonus: String(record.bonus),
    deductions: String(record.deductions),
    reimbursements: String(record.reimbursements),
  });
  const dirty =
    Number(f.grossSalary) !== record.grossSalary ||
    Number(f.hoursWorked) !== record.hoursWorked ||
    Number(f.bonus) !== record.bonus ||
    Number(f.deductions) !== record.deductions ||
    Number(f.reimbursements) !== record.reimbursements;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/payroll/records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossSalary: Number(f.grossSalary),
          hoursWorked: Number(f.hoursWorked),
          bonus: Number(f.bonus),
          deductions: Number(f.deductions),
          reimbursements: Number(f.reimbursements),
        }),
      });
      if (res.ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  const num = (key: keyof typeof f) => (
    <Input
      type="number"
      min={0}
      value={f[key]}
      onChange={(e) => setF({ ...f, [key]: e.target.value })}
      className="h-8 w-20 px-2 text-right text-sm"
    />
  );

  return (
    <tr>
      <td className="px-4 py-2.5">
        <p className="font-medium text-stone-900">{record.employeeName}</p>
        <p className="text-xs text-stone-400">{record.employeeType.toLowerCase().replace("_", " ")}</p>
      </td>
      <td className="px-4 py-2.5 text-right">{editable ? num("grossSalary") : money(record.grossSalary)}</td>
      <td className="px-4 py-2.5 text-right">{editable ? num("hoursWorked") : record.hoursWorked || "—"}</td>
      <td className="px-4 py-2.5 text-right">{editable ? num("bonus") : money(record.bonus)}</td>
      <td className="px-4 py-2.5 text-right">{editable ? num("deductions") : money(record.deductions)}</td>
      <td className={cn("px-4 py-2.5 text-right font-semibold", record.netPay < 0 ? "text-rose-600" : "text-stone-900")}>
        {money(record.netPay)}
      </td>
      {editable ? (
        <td className="px-4 py-2.5 text-right">
          <Button size="sm" variant="ghost" disabled={busy || !dirty} onClick={save}>
            {busy ? "…" : "Save"}
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
    </div>
  );
}
