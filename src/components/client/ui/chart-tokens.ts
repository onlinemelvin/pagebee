/** Warm-led data-viz palette for the client dashboard. Honey/amber leads, with
 *  complementary teal/violet/orange/rose accents for multi-series charts.
 *  Class strings are written out in full so Tailwind's JIT picks them up. */

export type Accent = "amber" | "teal" | "violet" | "orange" | "rose" | "emerald" | "sky";

export const ACCENTS: Record<Accent, { tile: string; text: string; hex: string; soft: string }> = {
  amber: { tile: "bg-amber-100 text-amber-700", text: "text-amber-700", hex: "#f59e0b", soft: "#fde68a" },
  teal: { tile: "bg-teal-100 text-teal-700", text: "text-teal-700", hex: "#14b8a6", soft: "#99f6e4" },
  violet: { tile: "bg-violet-100 text-violet-700", text: "text-violet-700", hex: "#8b5cf6", soft: "#ddd6fe" },
  orange: { tile: "bg-orange-100 text-orange-700", text: "text-orange-700", hex: "#fb923c", soft: "#fed7aa" },
  rose: { tile: "bg-rose-100 text-rose-700", text: "text-rose-700", hex: "#fb7185", soft: "#fecdd3" },
  emerald: { tile: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", hex: "#10b981", soft: "#a7f3d0" },
  sky: { tile: "bg-sky-100 text-sky-700", text: "text-sky-700", hex: "#0ea5e9", soft: "#bae6fd" },
};

/** Ordered series colors for charts with N categories. */
export const CHART_SERIES = ["#f59e0b", "#8b5cf6", "#14b8a6", "#fb923c", "#fb7185", "#0ea5e9", "#10b981"];
