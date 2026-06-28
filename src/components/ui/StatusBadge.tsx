import { cn } from "@/lib/utils";

/**
 * One source of truth for status pills across the ops surfaces (prospects, quotes, commissions,
 * contracts, payroll, employment). Replaces the per-component colour maps that had drifted apart.
 */
type Tone = "neutral" | "info" | "progress" | "warn" | "success" | "danger" | "honey";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-600 ring-stone-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  honey: "bg-amber-100 text-amber-800 ring-amber-300",
};

// Status → tone, keyed by upper-cased status (covers every ops enum + the lowercase prospect strings).
const TONE: Record<string, Tone> = {
  // prospect
  NEW: "neutral", CONTACTED: "info", QUALIFIED: "progress", PREVIEW_SENT: "progress",
  QUOTED: "warn", CLOSED: "success", LOST: "danger",
  // quote
  DRAFT: "neutral", NEEDS_APPROVAL: "warn", APPROVED: "info", SENT: "progress",
  VIEWED: "progress", ACCEPTED: "success", REJECTED: "danger", EXPIRED: "neutral", CONVERTED: "success",
  // commission
  PENDING: "neutral", ELIGIBLE: "info", PAID: "success", CLAWED_BACK: "danger",
  // contract
  SIGNED: "success", ACTIVE: "success", TERMINATED: "danger",
  // employment / payroll
  ON_LEAVE: "warn",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toUpperCase().replace(/\s+/g, "_");
  const tone = TONE[key] ?? "neutral";
  const label = status.replace(/_/g, " ").toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
