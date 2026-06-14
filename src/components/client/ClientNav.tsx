"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, CalendarCheck, FileText, Globe, Tag, Image, CreditCard, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavTab {
  key: string;
  label: string;
  href: string;
  badge?: number;
}

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  inquiries: Inbox,
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
      {tabs.map((t) => {
        const Icon = ICONS[t.key] ?? LayoutDashboard;
        const active = t.href === "/client" ? path === "/client" : path.startsWith(t.href);
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
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800",
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
