// Per-plan accent colours for upsell affordances (locked nav cues + the upgrade gate). Kept subtle
// and deliberately scoped: the honey/amber brand stays primary everywhere — these only tint the
// premium-plan cues so HONEY vs HIVE reads at a glance, never the core nav, badges, or CTAs.
// Retune the whole palette here in one place. Class strings are written out in full so Tailwind's
// JIT keeps them (never build accent classes by string interpolation).

export interface PlanAccent {
  navTag: string; // locked nav "Upgrade" pill (idle state)
  gateBorder: string; // upgrade-gate card border
  gateIcon: string; // upgrade-gate lock badge
  gateCheck: string; // upgrade-gate highlight check marks
}

const ACCENTS: Record<string, PlanAccent> = {
  HONEY: {
    navTag: "bg-rose-50 text-rose-700",
    gateBorder: "border-rose-200",
    gateIcon: "bg-rose-100 text-rose-700",
    gateCheck: "text-rose-500",
  },
  HIVE: {
    navTag: "bg-violet-50 text-violet-700",
    gateBorder: "border-violet-200",
    gateIcon: "bg-violet-100 text-violet-700",
    gateCheck: "text-violet-500",
  },
};

// Honey/amber fallback for any plan without a specific accent (e.g. NECTAR, or unknown names).
const DEFAULT_ACCENT: PlanAccent = {
  navTag: "bg-amber-50 text-amber-700",
  gateBorder: "border-amber-200",
  gateIcon: "bg-amber-100 text-amber-700",
  gateCheck: "text-amber-600",
};

/** Accent palette for a plan name (NECTAR/HONEY/HIVE); falls back to the honey theme. */
export function planAccent(plan: string | undefined | null): PlanAccent {
  return (plan ? ACCENTS[plan] : undefined) ?? DEFAULT_ACCENT;
}
