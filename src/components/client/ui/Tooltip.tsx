"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hover/focus tooltip. Wraps any trigger; bubble appears above by default. */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("tip-trigger relative inline-flex", className)} tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "tip absolute left-1/2 z-50 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg",
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** Small info affordance with a tooltip — for inline help next to labels. */
export function HelpHint({ label }: { label: React.ReactNode }) {
  return (
    <Tooltip label={label}>
      <Info size={14} className="text-stone-400 hover:text-stone-600" />
    </Tooltip>
  );
}
