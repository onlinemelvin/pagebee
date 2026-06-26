"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search, Bell, Menu, X, LogOut, CreditCard, ChevronDown, ArrowRight, Sparkles, FlaskConical,
  LayoutDashboard, Inbox, CalendarCheck, FileText, Globe, Tag, Image as ImageIcon,
  Eye, Clock, Rocket, CheckCircle2, AlertTriangle, Receipt, CalendarClock, XCircle, PartyPopper,
  Gauge, LifeBuoy, Settings, CheckCheck, MessageSquare, type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ClientNav, type NavTab } from "./ClientNav";
import { LogoMark } from "@/components/brand/Logo";

interface ActionItem { title: string; desc: string; href: string; cta: string; primary?: boolean }

const TAB_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, inquiries: Inbox, appointments: CalendarCheck,
  invoices: FileText, services: Tag, website: Globe, media: ImageIcon, chats: MessageSquare,
};

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);
  return ref;
}

export function Topbar({
  email, userName = null, businessName, planName, tabs, actions, isOwner = true, testMode = false, testModeEligible = false,
}: {
  email: string;
  userName?: string | null;
  businessName: string;
  planName: string;
  tabs: NavTab[];
  actions: ActionItem[];
  isOwner?: boolean;
  testMode?: boolean;
  testModeEligible?: boolean;
}) {
  const [drawer, setDrawer] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => { setDrawer(false); }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-stone-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
        <button
          onClick={() => setDrawer(true)}
          className="grid h-9 w-9 place-items-center rounded-lg text-stone-600 hover:bg-stone-100 sm:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <QuickSearch tabs={tabs} />

        <div className="ml-auto flex items-center gap-1.5">
          {testModeEligible && <TestModeToggle enabled={testMode} />}
          <Notifications actions={actions} />
          <AvatarMenu email={email} userName={userName} businessName={businessName} planName={planName} isOwner={isOwner} />
        </div>
      </header>

      {/* Mobile drawer — rendered outside the backdrop-blurred header so `fixed`
          is positioned against the viewport, not the header's containing block. */}
      {drawer && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-stone-900/40 anim-pop" onClick={() => setDrawer(false)} />
          <aside className="anim-rise absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <LogoMark size={32} />
                <span className="max-w-[150px] truncate font-display text-sm font-semibold text-stone-900">{businessName}</span>
              </span>
              <button onClick={() => setDrawer(false)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <ClientNav tabs={tabs} />
            {isOwner && (
              <div className="mt-auto border-t border-stone-100 pt-3">
                <Link href="/client/billing" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
                  <CreditCard size={18} /> Billing
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

/* ── Quick search / jump-to ───────────────────────────────────────────── */
function QuickSearch({ tabs }: { tabs: NavTab[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  // Only on-plan tabs expose deep-link shortcuts; locked (upsell) tabs jump to their page's gate.
  const keys = new Set(tabs.filter((t) => !t.locked).map((t) => t.key));
  const dest: { label: string; href: string; icon: LucideIcon; group: string }[] = [
    ...tabs.map((t) => ({ label: t.label, href: t.href, icon: TAB_ICONS[t.key] ?? LayoutDashboard, group: "Go to" })),
  ];
  if (keys.has("invoices")) {
    dest.push(
      { label: "New invoice", href: "/client/invoices/new?type=INVOICE", icon: FileText, group: "Create" },
      { label: "Tax & reports", href: "/client/invoices/reports", icon: FileText, group: "Finance" },
      { label: "Finance settings", href: "/client/invoices/settings", icon: FileText, group: "Finance" },
    );
  }
  if (keys.has("appointments")) dest.push({ label: "Availability settings", href: "/client/appointments/settings", icon: CalendarCheck, group: "Appointments" });
  dest.push({ label: "Billing", href: "/client/billing", icon: CreditCard, group: "Account" });

  const filtered = q.trim() ? dest.filter((d) => d.label.toLowerCase().includes(q.toLowerCase())) : dest;

  return (
    <div ref={ref} className="relative w-full max-w-xs sm:max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-400 focus-within:border-amber-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search or jump to…"
          aria-label="Search or jump to a page"
          className="w-full bg-transparent text-stone-700 placeholder:text-stone-400 focus:outline-none"
        />
      </div>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-80 w-full overflow-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl anim-pop">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-stone-400">No matches for “{q}”.</p>
          ) : (
            filtered.map((d) => (
              <button
                key={d.href}
                onClick={() => { router.push(d.href); setOpen(false); setQ(""); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
              >
                <d.icon size={16} className="text-stone-400" />
                <span className="flex-1">{d.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-stone-300">{d.group}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Notifications ────────────────────────────────────────────────────── */
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string;
  icon: string;
  level: "info" | "success" | "warning";
  read: boolean;
  createdAt: string;
}

// Lucide icon names stored on a notification → component (see notification/meta.ts).
const NOTIF_ICONS: Record<string, LucideIcon> = {
  Bell, Eye, Clock, Rocket, CheckCircle2, AlertTriangle, Receipt, CalendarClock, XCircle,
  Sparkles, PartyPopper, Gauge, Inbox, CalendarCheck, LifeBuoy, Globe, MessageSquare,
};

const LEVEL_STYLES: Record<Notification["level"], string> = {
  info: "bg-stone-100 text-stone-500",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function Notifications({ actions }: { actions: ActionItem[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const [items, setItems] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/client/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* fail-soft — the bell just shows what it last had */
    }
  }, []);

  // Initial load + light polling so new notifications surface without a reload.
  React.useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Opening the panel clears the unread badge (mark all read, optimistically).
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((cur) => cur.map((n) => ({ ...n, read: true })));
      try {
        await fetch("/api/v1/client/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      } catch {
        /* fail-soft */
      }
    }
  }

  // Badge = unread notifications + live "needs attention" action items.
  const badge = unread + actions.length;
  const empty = items.length === 0 && actions.length === 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        aria-label={badge > 0 ? `Notifications, ${badge} items` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={19} />
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[22rem] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl anim-pop">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-display text-sm font-semibold text-stone-900">Notifications</p>
            <Link href="/client/settings" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Notification settings">
              <Settings size={15} />
            </Link>
          </div>

          {empty ? (
            <div className="px-4 py-10 text-center">
              <Sparkles size={22} className="mx-auto text-amber-400" />
              <p className="mt-2 text-sm text-stone-500">You&apos;re all caught up.</p>
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-auto">
              {/* Live "needs attention" — derived from current account state. */}
              {actions.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Needs attention</p>
                  <ul>
                    {actions.map((a, i) => (
                      <li key={`a${i}`}>
                        <Link href={a.href} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50">
                          <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", a.primary ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500")}>
                            <ArrowRight size={14} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-stone-900">{a.title}</span>
                            <span className="block truncate text-xs text-stone-500">{a.desc}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Recorded notifications (persistent feed). */}
              {items.length > 0 && (
                <>
                  {actions.length > 0 && <div className="border-t border-stone-100" />}
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Recent</p>
                  <ul>
                    {items.map((n) => {
                      const Icon = NOTIF_ICONS[n.icon] ?? Bell;
                      return (
                        <li key={n.id}>
                          <Link href={n.href} onClick={() => setOpen(false)} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-stone-50", !n.read && "bg-amber-50/40")}>
                            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", LEVEL_STYLES[n.level])}>
                              <Icon size={14} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-stone-900">{n.title}</span>
                              {n.body && <span className="block truncate text-xs text-stone-500">{n.body}</span>}
                              <span className="mt-0.5 block text-[11px] text-stone-400">{timeAgo(n.createdAt)}</span>
                            </span>
                            {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          <Link href="/client/settings" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 border-t border-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-500 hover:bg-stone-50 hover:text-stone-700">
            <CheckCheck size={13} /> Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}

/* ── Test Mode toggle (testers only) ──────────────────────────────────── */
function TestModeToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setOn(enabled), [enabled]);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/v1/client/test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh(); // re-read server state (generation now stubs/replays)
    } catch {
      setOn(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={on ? "Test mode is ON — website generation is stubbed/replayed (no AI cost)" : "Turn on Test Mode (stub AI generation)"}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60",
        on
          ? "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200"
          : "border-stone-200 text-stone-500 hover:bg-stone-100",
      )}
    >
      <FlaskConical size={14} />
      <span className="hidden sm:inline">Test mode</span>
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", on ? "bg-violet-500" : "bg-stone-300")} />
    </button>
  );
}

/* ── Avatar menu ──────────────────────────────────────────────────────── */
function AvatarMenu({ email, userName, businessName, planName, isOwner }: { email: string; userName?: string | null; businessName: string; planName: string; isOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  // Staff are identified by their own name; owners by the business they run.
  const primary = (!isOwner && userName?.trim()) || businessName;
  const initials = primary.trim().slice(0, 2).toUpperCase() || "PB";

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-xs font-bold text-white">{initials}</span>
        <ChevronDown size={15} className="hidden text-stone-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl anim-pop">
          <div className="border-b border-stone-100 px-4 py-3">
            <p className="truncate font-display text-sm font-semibold text-stone-900">{primary}</p>
            <p className="truncate text-xs text-stone-400">{email}</p>
            {isOwner ? (
              <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">{planName} plan</span>
            ) : (
              <span className="mt-1.5 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">{businessName} · Team member</span>
            )}
          </div>
          <div className="p-1.5">
            {isOwner && (
              <Link href="/client/billing" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
                <CreditCard size={16} className="text-stone-400" /> Billing & plan
              </Link>
            )}
            <Link href="/client/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
              <Settings size={16} className="text-stone-400" /> Settings
            </Link>
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">
              <LogOut size={16} className="text-stone-400" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
