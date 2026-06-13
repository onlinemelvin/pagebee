"use client";

import * as React from "react";

/** Smooth area/line chart with a draw-in animation and an optional peak marker. */
export function AreaChart({
  points,
  labels,
  color = "#f59e0b",
  height = 180,
  money = false,
}: {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  money?: boolean;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const W = 320;
  const H = height;
  const pad = 6;
  const pts = points.length ? points : [0, 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const step = pts.length > 1 ? (W - pad * 2) / (pts.length - 1) : 0;
  const xy = pts.map((v, i) => [pad + i * step, H - pad - ((v - min) / span) * (H - pad * 2)] as const);

  // smooth path via Catmull-Rom → cubic bezier
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const [x0, y0] = xy[Math.max(0, i - 1)];
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[i + 1];
    const [x3, y3] = xy[Math.min(xy.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  const areaD = `${d} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z`;
  const peakIdx = pts.indexOf(max);
  const [px, py] = xy[peakIdx] ?? [0, 0];
  const gid = React.useId();
  const fmt = (v: number) => (money ? `$${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : String(v));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gid})`} opacity={mounted ? 1 : 0} style={{ transition: "opacity 0.7s ease 0.25s" }} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          pathLength={1}
          className="chart-draw"
          style={{ strokeDasharray: 1, strokeDashoffset: mounted ? 0 : 1 }}
        />
        {max > 0 && (
          <circle cx={px} cy={py} r={4} fill="#fff" stroke={color} strokeWidth={2.5} opacity={mounted ? 1 : 0} style={{ transition: "opacity 0.3s ease 0.9s" }} />
        )}
      </svg>
      {labels && labels.length > 0 && (
        <div className="mt-2 flex justify-between text-[10px] text-stone-400">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      <span className="sr-only">Peak {fmt(max)}</span>
    </div>
  );
}
