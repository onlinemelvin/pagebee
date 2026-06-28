import { cn } from "@/lib/utils";

/**
 * Lightweight CSS-only tooltip — wraps any trigger and reveals `label` on hover/focus. No JS, no
 * portal; good enough for explaining ops jargon (clawback, eligible, MRR sourced…). For dense data
 * UIs prefer this over leaving terms unexplained.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex items-center", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-stone-50 opacity-0 shadow-lg transition-all duration-150 group-hover/tt:translate-y-0 group-hover/tt:opacity-100 group-focus-within/tt:translate-y-0 group-focus-within/tt:opacity-100"
      >
        {label}
        <span className="absolute left-1/2 top-full h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-stone-900" />
      </span>
    </span>
  );
}
