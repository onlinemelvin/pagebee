"use client";

import * as React from "react";

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

/** Grouped bar chart (divs, not SVG, for crisp rounded bars + easy responsiveness).
 *  Bars grow from the baseline on mount. Hover a column to reveal values. */
export function BarChart({
  categories,
  series,
  height = 200,
  money = false,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  money?: boolean;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const fmt = (v: number) => (money ? `$${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : String(v));
  const gridVals = [max, max * 0.5, 0];

  return (
    <div>
      <div className="flex gap-3" style={{ height }}>
        {/* Y axis */}
        <div className="flex w-10 shrink-0 flex-col justify-between py-1 text-right text-[10px] tabular-nums text-stone-400">
          {gridVals.map((v, i) => (
            <span key={i}>{fmt(v)}</span>
          ))}
        </div>
        {/* Plot */}
        <div className="relative flex-1">
          {gridVals.map((_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-t border-dashed border-stone-100"
              style={{ top: `${(i / (gridVals.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-2 px-1">
            {categories.map((cat, ci) => (
              <div key={cat} className="group/col relative flex h-full flex-1 items-end justify-center gap-1">
                {/* tooltip */}
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-stone-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition group-hover/col:opacity-100">
                  {series.map((s) => (
                    <div key={s.name} className="whitespace-nowrap">
                      {s.name}: {fmt(s.values[ci] ?? 0)}
                    </div>
                  ))}
                </div>
                {series.map((s) => (
                  <div
                    key={s.name}
                    className="bar-grow w-full max-w-[18px] rounded-t-md"
                    style={{
                      height: `${((s.values[ci] ?? 0) / max) * 100}%`,
                      background: s.color,
                      transform: mounted ? "scaleY(1)" : "scaleY(0)",
                      transitionDelay: `${ci * 0.04}s`,
                      minHeight: (s.values[ci] ?? 0) > 0 ? 3 : 0,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* X labels */}
      <div className="mt-2 flex gap-3">
        <div className="w-10 shrink-0" />
        <div className="flex flex-1 justify-around gap-2 px-1 text-[10px] text-stone-400">
          {categories.map((c) => (
            <span key={c} className="flex-1 truncate text-center">{c}</span>
          ))}
        </div>
      </div>
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-stone-500">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
