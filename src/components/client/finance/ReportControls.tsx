"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Date-range picker + CSV download links for the finance reports. */
export function ReportControls({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);
  const qs = `from=${f}&to=${t}`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <label className="grid gap-1 text-sm font-medium text-stone-700">
        <span className="flex items-center gap-1"><CalendarRange size={13} /> From</span>
        <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-medium text-stone-700">
        To
        <Input type="date" value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      <Button variant="outline" onClick={() => router.push(`/client/invoices/reports?${qs}`)}>Apply</Button>
      <div className="ml-auto flex gap-2">
        <a href={`/api/v1/client/finance/reports/tax?${qs}`} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <Download size={15} /> Sales tax CSV
        </a>
        <a href={`/api/v1/client/finance/reports/income?${qs}`} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <Download size={15} /> Income CSV
        </a>
      </div>
    </div>
  );
}
