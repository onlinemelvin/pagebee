"use client";

import { Printer } from "lucide-react";

/** Print / Save-as-PDF trigger. Hidden when printing. */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300 print:hidden"
    >
      <Printer size={15} /> {label}
    </button>
  );
}
