import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, type Accent } from "./chart-tokens";
import { CountUp } from "./CountUp";
import { Sparkline } from "./Sparkline";
import { Tooltip } from "./Tooltip";

/** Headline metric tile: accent icon, animated value, label, optional trend pill
 *  and sparkline. Pass `value` (number, animates) OR `display` (string, e.g. "Live"). */
export function StatCard({
  icon: Icon,
  label,
  value,
  display,
  cents,
  prefix,
  suffix,
  accent = "amber",
  trend,
  spark,
  href,
  hint,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  display?: string;
  cents?: boolean;
  prefix?: string;
  suffix?: string;
  accent?: Accent;
  trend?: { dir: "up" | "down"; label: string };
  spark?: number[];
  href?: string;
  hint?: string;
  index?: number;
}) {
  const a = ACCENTS[accent];
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", a.tile)}>
          <Icon size={20} />
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.dir === "up" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
            )}
          >
            {trend.dir === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.label}
          </span>
        )}
        {!trend && hint && <Tooltip label={hint}><span className="text-stone-300">ⓘ</span></Tooltip>}
      </div>
      <p className="mt-3 font-display text-3xl leading-none text-stone-900">
        {value !== undefined ? <CountUp value={value} cents={cents} prefix={prefix} suffix={suffix} /> : display}
      </p>
      <p className="mt-1.5 text-sm text-stone-500">{label}</p>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline data={spark} color={a.hex} height={32} />
        </div>
      )}
    </>
  );

  const cls = cn(
    "anim-rise block rounded-2xl border border-stone-200 bg-white p-5",
    href && "lift hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
  );
  const style = { "--d": `${index * 60}ms` } as React.CSSProperties;

  return href ? (
    <Link href={href} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
