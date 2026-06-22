import type { PlanName } from "@/lib/plans";

export type PlanBadge = { label: string; className: string };

/**
 * Presentation-only "tags" shown on plan cards (pricing page + register flow).
 * Kept here so both surfaces stay in sync. Not every plan has a badge.
 */
export const PLAN_BADGES: Partial<Record<PlanName, PlanBadge>> = {
  HONEY: { label: "Most popular", className: "bg-amber-400 text-stone-950" },
  HIVE: { label: "Most value", className: "bg-emerald-500 text-white" },
};
