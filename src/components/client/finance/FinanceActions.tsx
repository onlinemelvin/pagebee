"use client";

import * as React from "react";
import Link from "next/link";
import { FilePlus2, FileText, ScrollText, FileBarChart, SlidersHorizontal, RefreshCw } from "lucide-react";
import { CreateDocumentWizard, type WizardSettings } from "./CreateDocumentWizard";
import type { DocType, TaxRateDTO } from "@/lib/modules/finance";
import type { EditorService, EditorCustomer } from "./DocumentEditor";

/** The Finance dashboard's action bar: opens the stepped creation wizard (modal) for each doc type,
 *  plus links to reports and settings. Data for the wizard is fetched server-side and passed in. */
export function FinanceActions({
  services,
  taxRates,
  customers,
  settings,
  taxMode,
}: {
  services: EditorService[];
  taxRates: TaxRateDTO[];
  customers: EditorCustomer[];
  settings: WizardSettings;
  taxMode: "manual" | "automatic";
}) {
  const [wizardType, setWizardType] = React.useState<DocType | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setWizardType("INVOICE")} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300">
          <FilePlus2 size={16} /> New invoice
        </button>
        <button onClick={() => setWizardType("ESTIMATE")} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <FileText size={16} /> Estimate
        </button>
        <button onClick={() => setWizardType("QUOTE")} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <ScrollText size={16} /> Quote
        </button>
        <Link href="/client/invoices/recurring" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <RefreshCw size={16} /> Recurring
        </Link>
        <Link href="/client/invoices/reports" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <FileBarChart size={16} /> Tax &amp; reports
        </Link>
        <Link href="/client/invoices/settings" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
          <SlidersHorizontal size={16} /> Settings
        </Link>
      </div>

      <CreateDocumentWizard
        open={wizardType !== null}
        initialType={wizardType ?? "INVOICE"}
        services={services}
        taxRates={taxRates}
        customers={customers}
        settings={settings}
        taxMode={taxMode}
        onClose={() => setWizardType(null)}
      />
    </>
  );
}
