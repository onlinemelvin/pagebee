"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, ArrowUpCircle, Globe, Users, FileCheck, DollarSign, Briefcase, Banknote, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminTab {
  key: string;
  label: string;
  href: string;
  badge?: number;
}

/** A labelled section of nav items. An empty `label` renders the group with no header. */
export interface AdminNavGroup {
  label?: string;
  tabs: AdminTab[];
}

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  leads: Inbox,
  reps: Users,
  quotes: FileCheck,
  commissions: DollarSign,
  employees: Briefcase,
  payroll: Banknote,
  upgrades: ArrowUpCircle,
  websites: Globe,
};

export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5 text-sm">
      {groups.map((group, gi) => (
        <div key={group.label ?? `g${gi}`} className="flex flex-col gap-1">
          {group.label ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{group.label}</p>
          ) : null}
          {group.tabs.map((t) => {
            const Icon = ICONS[t.key] ?? LayoutDashboard;
            const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
                  active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} /> {t.label}
                </span>
                {t.badge ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800")}>
                    {t.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
