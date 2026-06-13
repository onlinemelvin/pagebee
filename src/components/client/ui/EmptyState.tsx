import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Delightful empty/initial state: soft icon medallion, headline, helper copy,
 *  and a primary call-to-action. Use everywhere a list/section can be empty. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondary,
  accent = "amber",
  className,
  compact,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: React.ReactNode;
  cta?: { label: string; href?: string; onClick?: () => void; icon?: React.ComponentType<{ size?: number }> };
  secondary?: React.ReactNode;
  accent?: "amber" | "stone";
  className?: string;
  compact?: boolean;
}) {
  const CtaIcon = cta?.icon;
  const ring =
    accent === "amber"
      ? "from-amber-200/70 to-amber-50 text-amber-600"
      : "from-stone-200 to-stone-50 text-stone-500";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 text-center",
        compact ? "px-6 py-8" : "px-6 py-14",
        className,
      )}
    >
      <span className={cn("grid place-items-center rounded-2xl bg-gradient-to-b shadow-sm", compact ? "h-12 w-12" : "h-16 w-16", ring)}>
        <Icon size={compact ? 22 : 30} />
      </span>
      <h3 className={cn("font-display text-stone-900", compact ? "mt-3 text-base" : "mt-4 text-xl")}>{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-stone-500">{description}</p>}
      {cta &&
        (cta.href ? (
          <Link
            href={cta.href}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
          >
            {CtaIcon && <CtaIcon size={16} />} {cta.label}
          </Link>
        ) : (
          <button
            onClick={cta.onClick}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
          >
            {CtaIcon && <CtaIcon size={16} />} {cta.label}
          </button>
        ))}
      {secondary && <div className="mt-3 text-sm text-stone-400">{secondary}</div>}
    </div>
  );
}
