"use client";

import * as React from "react";

/** Tiny inline trend line with a soft area fill. Draws in on mount. */
export function Sparkline({
  data,
  color = "#f59e0b",
  height = 36,
  strokeWidth = 2,
  className,
}: {
  data: number[];
  color?: string;
  height?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const W = 100;
  const H = height;
  const pts = data.length ? data : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = pts.length > 1 ? W / (pts.length - 1) : W;
  const coords = pts.map((v, i) => [i * step, H - 2 - ((v - min) / span) * (H - 4)] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = React.useId();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} opacity={mounted ? 1 : 0} style={{ transition: "opacity 0.6s ease 0.2s" }} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="chart-draw"
        style={{ strokeDasharray: 1, strokeDashoffset: mounted ? 0 : 1 }}
      />
    </svg>
  );
}
