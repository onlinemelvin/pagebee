"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarClock, BookOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepTab {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

// Owned by this client component — the icons are component references, so the tab list must live
// inside the "use client" boundary (a server component can't import this value and pass it across).
const REP_TABS: RepTab[] = [
  { key: "dashboard", label: "Dashboard", href: "/rep", icon: LayoutDashboard },
  { key: "prospects", label: "Prospects", href: "/rep/prospects", icon: Users },
  { key: "follow-ups", label: "Follow-ups", href: "/rep/follow-ups", icon: CalendarClock },
  { key: "resources", label: "Resources", href: "/rep/resources", icon: BookOpen },
];

/** Sidebar nav for the rep portal. `followUpBadge` is the open-follow-up count (computed server-side). */
export function RepNav({ followUpBadge }: { followUpBadge?: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {REP_TABS.map((t) => {
        const Icon = t.icon;
        const active = t.href === "/rep" ? path === "/rep" : path.startsWith(t.href);
        const badge = t.key === "follow-ups" ? followUpBadge : undefined;
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
            {badge ? (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
