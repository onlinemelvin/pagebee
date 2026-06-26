"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, AlertTriangle, Bot, UserCheck, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/client/ui/EmptyState";
import type { ConversationSummary } from "@/lib/modules/chat";

const STATUS: Record<string, { label: string; cls: string; icon: typeof Bot }> = {
  escalated: { label: "Needs you", cls: "bg-rose-100 text-rose-700", icon: AlertTriangle },
  awaiting_contact: { label: "Awaiting contact", cls: "bg-amber-100 text-amber-800", icon: AlertTriangle },
  ai: { label: "AI handling", cls: "bg-stone-100 text-stone-500", icon: Bot },
  human: { label: "You're handling", cls: "bg-blue-100 text-blue-700", icon: UserCheck },
  closed: { label: "Closed", cls: "bg-stone-100 text-stone-400", icon: CheckCircle2 },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatsInbox({ initial }: { initial: ConversationSummary[] }) {
  const router = useRouter();
  // Light auto-refresh so new/escalated chats surface without a manual reload.
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  if (initial.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="When a visitor chats with your website assistant, the conversation shows up here. You'll get an alert the moment one needs you."
        />
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-2">
      {initial.map((c) => {
        const st = STATUS[c.status] ?? STATUS.ai;
        return (
          <li key={c.id}>
            <Link
              href={`/client/chats/${c.id}`}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-card transition hover:shadow-card-hover",
                c.escalated ? "border-rose-200" : "border-stone-200",
              )}
            >
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", c.escalated ? "bg-rose-50 text-rose-600" : "bg-stone-100 text-stone-400")}>
                <st.icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-stone-900">{c.visitorName || "Website visitor"}</span>
                  {c.unread > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}
                </span>
                <span className="block truncate text-sm text-stone-500">{c.lastMessage || "—"}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", st.cls)}>{st.label}</span>
                <span className="text-xs text-stone-400">{timeAgo(c.lastAt)}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-stone-300" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
