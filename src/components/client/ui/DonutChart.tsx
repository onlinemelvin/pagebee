"use client";

import * as React from "react";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Animated donut. Segments draw in clockwise from 12 o'clock on mount. */
export function DonutChart({
  segments,
  size = 150,
  thickness = 18,
  center,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let cum = 0;

  const label = total > 0 ? `Donut chart. ${segments.map((s) => `${s.label}: ${s.value}`).join(", ")}.` : "Donut chart, no data";
  return (
    <div className={className} style={{ position: "relative", width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1efe9" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((seg, i) => {
            const frac = seg.value / total;
            const len = frac * C;
            const offset = -(cum / total) * C;
            cum += seg.value;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={mounted ? `${Math.max(len - 1.5, 0)} ${C}` : `0 ${C}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: reduce ? "none" : `stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s` }}
              />
            );
          })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

/** Legend row used beneath/next to a donut. */
export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-stone-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
          <span className="font-semibold text-stone-900">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}
