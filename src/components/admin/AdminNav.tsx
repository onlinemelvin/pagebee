"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, ArrowUpCircle, Globe, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminTab {
  key: string;
  label: string;
  href: string;
  badge?: number;
}

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  leads: Inbox,
  upgrades: ArrowUpCircle,
  websites: Globe,
};

export function AdminNav({ tabs }: { tabs: AdminTab[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {tabs.map((t) => {
        const Icon = ICONS[t.key] ?? LayoutDashboard;
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2 transition-colors",
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
    </nav>
  );
}
