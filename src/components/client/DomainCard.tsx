"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Globe, ChevronRight, Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomDomainPanel } from "./CustomDomainPanel";
import type { DomainState } from "@/lib/modules/website";

/** Domain status → a feature-card-style tag (enabled / pending / not set up / needs attention). */
function statusTag(status: string | null | undefined) {
  switch (status) {
    case "active":
      return { label: "Enabled", cls: "bg-green-100 text-green-800", icon: Check };
    case "requested":
    case "price_review":
      return { label: "In review", cls: "bg-amber-100 text-amber-800", icon: Clock };
    case "verifying":
    case "purchasing":
      return { label: "Pending", cls: "bg-amber-100 text-amber-800", icon: Clock };
    case "error":
      return { label: "Needs attention", cls: "bg-rose-100 text-rose-700", icon: undefined };
    default:
      return { label: "Not set up", cls: "bg-stone-200 text-stone-600", icon: undefined };
  }
}

/**
 * Custom domain as a compact card that matches the feature grid. It isn't a toggle (a domain needs
 * DNS + admin), so the card opens a modal with the full flows — connect an existing domain or buy a
 * new one. The tag reflects the live status (Enabled / Pending / In review / Not set up).
 */
export function DomainCard({ initial, testModeActive }: { initial: DomainState | null; testModeActive?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const tag = statusTag(initial?.status);
  const TagIcon = tag.icon;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lift group flex w-full flex-col rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-card transition-shadow hover:border-amber-300 hover:shadow-card-hover"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">
            <Globe size={20} />
          </span>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tag.cls)}>
              {TagIcon && <TagIcon size={11} />} {tag.label}
            </span>
            <ChevronRight size={18} className="text-stone-400 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
        <p className="mt-3 font-medium text-stone-900">Custom domain</p>
        <p className="mt-1 flex-1 text-sm text-stone-600">
          {initial?.domain ?? "Use your own domain (yoursite.com) instead of your free address."}
        </p>
      </button>

      {open && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => setOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><Globe size={18} /></span>
                  <div>
                    <h2 className="font-display text-xl text-stone-900">Custom domain</h2>
                    <p className="text-sm text-stone-500">Use your own domain instead of your free address.</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="mt-4">
                <CustomDomainPanel initial={initial} testModeActive={testModeActive} bare />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
