import * as React from "react";
import { cn } from "@/lib/utils";

/** A titled content panel — the workhorse container for dashboard sections.
 *  Header shows an optional icon + title + subtitle on the left and an
 *  optional control (filter, link, button) on the right. */
export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
  bodyClassName,
  style,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section
      style={style}
      className={cn(
        "rounded-2xl border border-stone-200/80 bg-white p-5 shadow-card sm:p-6",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-100 text-stone-500">
                <Icon size={16} />
              </span>
            )}
            <div>
              {title && <h2 className="font-display text-lg leading-tight text-stone-900">{title}</h2>}
              {subtitle && <p className="text-xs text-stone-400">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(title || action ? "mt-4" : "", bodyClassName)}>{children}</div>
    </section>
  );
}
