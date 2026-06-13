"use client";

import * as React from "react";

interface Props {
  value: number;
  /** Treat value as integer cents → renders as $1,234.56 */
  cents?: boolean;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}

/** Animates a number from 0 → value on mount (rAF). Honors reduced-motion. */
export function CountUp({ value, cents, decimals, prefix = "", suffix = "", durationMs = 750, className }: Props) {
  const dp = decimals ?? (cents ? 2 : 0);
  const target = cents ? value / 100 : value;
  const [n, setN] = React.useState(target);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setN(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  const text = n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
