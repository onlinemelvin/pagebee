"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import { WebsiteIntakeForm } from "./WebsiteIntakeForm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Secondary "Regenerate" action that lives inside the primary website card. A compact button that
 * opens the intake form (in a modal) to submit updated details as a new draft for review — so the
 * page stays uncluttered while the full form is one click away.
 */
export function RegenerateButton({
  maxPages,
  canBook,
  canUseForms,
  label = "Regenerate",
  submitLabel = "Regenerate draft",
}: {
  maxPages: number;
  canBook: boolean;
  canUseForms: boolean;
  label?: string;
  submitLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <RefreshCw size={15} /> {label}
      </button>

      {open && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => setOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-xl text-stone-900">Regenerate your website</h2>
                  <p className="mt-1 text-sm text-stone-500">Submit updated details to create a new draft for review.</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="mt-5">
                <WebsiteIntakeForm submitLabel={submitLabel} maxPages={maxPages} canBook={canBook} canUseForms={canUseForms} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
