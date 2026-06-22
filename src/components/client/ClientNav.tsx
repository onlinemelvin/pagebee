"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, CalendarCheck, FileText, Globe, Tag, Image, CreditCard, Users, Contact, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { planAccent } from "./plan-accent";

export interface NavTab {
  key: string;
  label: string;
  href: string;
  badge?: number;
  tier?: 1 | 2 | 3;
  locked?: boolean; // off-plan → muted + plan tag; still navigable (lands on an upgrade gate)
  lockLabel?: string; // plan that unlocks it, shown as a small tag (e.g. "Connect")
}

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  inquiries: Inbox,
  customers: Contact,
  appointments: CalendarCheck,
  invoices: FileText,
  services: Tag,
  website: Globe,
  media: Image,
  team: Users,
  billing: CreditCard,
};

export function ClientNav({ tabs }: { tabs: NavTab[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {tabs.map((t, i) => {
        const Icon = ICONS[t.key] ?? LayoutDashboard;
        const active = t.href === "/client" ? path === "/client" : path.startsWith(t.href);
        // Thin separator whenever the tier changes — groups base / premium tiers visually.
        const prev = tabs[i - 1];
        const showSep = i > 0 && t.tier !== undefined && prev?.tier !== undefined && t.tier !== prev.tier;
        // Locked items carry their unlocking plan's accent (HONEY/HIVE) — tag + a faint icon tint.
        const accent = planAccent(t.lockLabel);
        return (
          <Fragment key={t.key}>
            {showSep && <div className="mx-1 my-1.5 border-t border-stone-100" />}
            <Link
              href={t.href}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
                active ? "bg-stone-900 text-white" : t.locked ? "text-stone-400 hover:bg-stone-50" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon size={18} className={cn("shrink-0", t.locked && !active && "text-stone-300")} />{" "}
                <span className="truncate">{t.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {t.locked ? (
                  // Compact, uniform "Upgrade" tag (not the per-plan name) so locked items align to one
                  // right edge and leave room for longer labels (e.g. "Appointments").
                  <span
                    className={cn(
                      "flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[10px] font-semibold leading-none",
                      active ? "bg-white/20 text-white" : accent.navTag,
                    )}
                  >
                    <Lock size={8} /> Upgrade
                  </span>
                ) : null}
                {t.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {t.badge}
                  </span>
                ) : null}
              </span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
