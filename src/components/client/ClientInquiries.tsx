"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search, Mail, Phone, Send, MessageSquarePlus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES } from "@/lib/modules/lead/schema";
import { EmptyState } from "@/components/client/ui/EmptyState";

export interface InquiryRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  type: string;
  status: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  QUALIFIED: "bg-violet-100 text-violet-800",
  BOOKED: "bg-teal-100 text-teal-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-stone-200 text-stone-600",
  SPAM: "bg-red-100 text-red-700",
};

const FILTERS = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ClientInquiries({ inquiries }: { inquiries: InquiryRow[] }) {
  const router = useRouter();
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("ALL");
  const [search, setSearch] = React.useState("");

  async function setStatus(id: string, status: string) {
    await fetch(`/api/v1/client/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function sendReply(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = String(new FormData(e.currentTarget).get("message") ?? "");
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/client/leads/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error();
      setReplyTo(null);
      setNote({ id, text: "Reply sent", ok: true });
      router.refresh();
    } catch {
      setNote({ id, text: "Couldn't send — try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { ALL: inquiries.length };
    for (const q of inquiries) c[q.status] = (c[q.status] ?? 0) + 1;
    return c;
  }, [inquiries]);

  const visible = inquiries.filter((q) => {
    if (filter !== "ALL" && q.status !== filter) return false;
    if (search.trim()) {
      const t = search.toLowerCase();
      return [q.name, q.email, q.phone, q.message].some((v) => v?.toLowerCase().includes(t));
    }
    return true;
  });

  if (inquiries.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon={Inbox}
        title="No inquiries yet"
        description="When someone fills out a form or messages you on your website, their inquiry lands here — ready for you to reply in one click."
        cta={{ label: "Preview your website", href: "/client/website" }}
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = counts[f] ?? 0;
            if (f !== "ALL" && n === 0) return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  filter === f ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50",
                )}
              >
                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                <span className={cn("ml-1.5", filter === f ? "text-white/70" : "text-stone-400")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm sm:w-64">
          <Search size={15} className="text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inquiries…"
            className="w-full bg-transparent placeholder:text-stone-400 focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState compact icon={Search} title="No matches" description="Try a different filter or search term." />
      ) : (
        <div className="space-y-3">
          {visible.map((q) => (
            <div key={q.id} className="anim-rise rounded-2xl border border-stone-200 bg-white p-5 transition hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-amber-50 text-sm font-bold text-amber-700">
                    {q.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-medium text-stone-900">{q.name}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-stone-500">
                      {q.email && <span className="inline-flex items-center gap-1"><Mail size={12} /> {q.email}</span>}
                      {q.phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {q.phone}</span>}
                    </p>
                    {q.type && <span className="mt-1 inline-block rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{q.type}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[q.status] ?? "bg-stone-100 text-stone-600")}>
                    {q.status}
                  </span>
                  <select
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    value={q.status}
                    onChange={(e) => setStatus(q.id, e.target.value)}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {q.message && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{q.message}</p>}
              <p className="mt-2 flex items-center gap-1 text-xs text-stone-400"><Clock size={12} /> {timeAgo(q.createdAt)}</p>

              <div className="mt-3">
                {q.email ? (
                  replyTo === q.id ? (
                    <form onSubmit={(e) => sendReply(q.id, e)} className="grid gap-2">
                      <Textarea name="message" required placeholder={`Reply to ${q.name}…`} autoFocus />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={busy}>
                          <Send size={14} /> {busy ? "Sending…" : "Send reply"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setReplyTo(q.id); setNote(null); }}>
                      <MessageSquarePlus size={14} /> Reply by email
                    </Button>
                  )
                ) : (
                  <span className="text-xs text-stone-400">No email provided — can&apos;t reply.</span>
                )}
                {note?.id === q.id && <p className={cn("mt-2 text-sm", note.ok ? "text-green-700" : "text-rose-600")}>{note.text}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
