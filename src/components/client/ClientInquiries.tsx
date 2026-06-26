"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Search, Mail, Phone, Send, MessageSquarePlus, Clock, MessageSquare, ArrowRight, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES } from "@/lib/modules/lead/schema";
import { LEAD_GOALS } from "@/lib/site/lead-goals";
import { EmptyState } from "@/components/client/ui/EmptyState";
import { toggleFeature } from "@/app/(client)/client/_actions/features";

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

export function ClientInquiries({
  inquiries,
  goal,
  formsEnabled,
  isOwner = true,
  smsState = "locked",
  smsPlanLabel = "a higher plan",
}: {
  inquiries: InquiryRow[];
  goal: string | null;
  formsEnabled: boolean;
  isOwner?: boolean;
  smsState?: "enabled" | "available" | "locked";
  smsPlanLabel?: string;
}) {
  const router = useRouter();
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("ALL");
  const [search, setSearch] = React.useState("");
  const [currentGoal, setCurrentGoal] = React.useState<string>(goal ?? "");

  // Lead-capture master switch. It writes the same `contactForm` flag as the Website page's feature
  // card, so the two stay in sync: flip optimistically, refresh so the server prop catches up (then drop
  // the override once it matches), or revert on failure — mirrors the Media gallery switch.
  const [formsOverride, setFormsOverride] = React.useState<boolean | null>(null);
  const [savingForms, setSavingForms] = React.useState(false);
  const formsOn = formsOverride ?? formsEnabled;
  React.useEffect(() => {
    setFormsOverride((o) => (o === formsEnabled ? null : o));
  }, [formsEnabled]);
  // Reconcile against the authoritative DB value on mount (the Router Cache can serve a stale prefetched
  // copy after a toggle on the Website page).
  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/features", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.features) return;
        const f = data.features.find((x: { key: string }) => x.key === "forms");
        if (!f) return;
        const fresh = f.state === "enabled";
        setFormsOverride((o) => (fresh === formsEnabled ? o : fresh));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleForms() {
    if (savingForms) return;
    const next = !formsOn;
    setSavingForms(true);
    setFormsOverride(next); // flip now
    try {
      const res = await toggleFeature("contactForm", next);
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setFormsOverride(null); // revert to the server value
    } finally {
      setSavingForms(false);
    }
  }

  async function setGoal(next: string) {
    const prev = currentGoal;
    setCurrentGoal(next); // optimistic; the live site picks it up at serve time
    try {
      const res = await fetch("/api/v1/client/lead-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCurrentGoal(prev); // revert on failure
    }
  }

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

  // Lead-capture settings card: the master switch (shared with the Website page) + the primary-action
  // dropdown. The dropdown only matters while the form is live, so it's disabled when the switch is off.
  const goalSelector = (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
      {/* Master switch — in sync with the Website page's "Lead capture form" feature card */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Inbox size={18} />
          </span>
          <div>
            <p className="font-display text-base text-stone-900">Collect inquiries from my website</p>
            <p className="text-sm text-stone-500">
              {formsOn
                ? "Your contact form is live — visitors can send you inquiries."
                : "Your contact form is hidden. Visitors see a “Contact Us” button instead."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formsOn}
          aria-label="Collect inquiries from my website"
          onClick={toggleForms}
          disabled={savingForms}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
            formsOn ? "bg-amber-500" : "bg-stone-300",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
              formsOn ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {/* Primary action — sets the CTA label, the form copy, and the type new leads come in as */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4", !formsOn && "opacity-50")}>
        <div>
          <p className="text-sm font-semibold text-stone-900">What your website asks visitors to do</p>
          <p className="mt-0.5 text-xs text-stone-500">Sets your call-to-action and the kind of inquiry you collect.</p>
        </div>
        <select
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
          value={currentGoal}
          disabled={!formsOn}
          onChange={(e) => setGoal(e.target.value)}
        >
          {currentGoal === "" && <option value="" disabled>Choose an action…</option>}
          {LEAD_GOALS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
    </div>
  );

  if (inquiries.length === 0) {
    // Text-alert option adapts to plan state: on, available-to-enable, or an upgrade prompt.
    const smsCta =
      smsState === "enabled"
        ? { label: "Manage text alerts", href: "/client/website" }
        : smsState === "available"
          ? { label: "Turn on text alerts", href: "/client/website" }
          : { label: `Upgrade to enable`, href: "/client/billing" };

    return (
      <div className="mt-6 space-y-4">
        {goalSelector}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Inbox size={20} /></span>
            <div>
              <p className="font-display text-lg text-stone-900">No inquiries yet</p>
              <p className="text-sm text-stone-500">When someone fills out your form or messages you, it lands here. Set up how you want to be alerted so you never miss a new lead.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {/* Email alerts — always on by default */}
            <div className="rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-stone-900"><Mail size={16} className="text-amber-500" /> Email alerts</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><Check size={11} /> On</span>
              </div>
              <p className="mt-1.5 text-sm text-stone-500">We email you the moment a new inquiry arrives.</p>
              {isOwner && (
                <Link href="/client/settings" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-800">
                  Manage email alerts <ArrowRight size={14} />
                </Link>
              )}
            </div>

            {/* Text alerts — SMS (smsAlerts feature) */}
            <div className="rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-stone-900"><MessageSquare size={16} className="text-amber-500" /> Text alerts</span>
                {smsState === "enabled" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><Check size={11} /> On</span>
                ) : smsState === "locked" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500"><Lock size={11} /> {smsPlanLabel}</span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500">Off</span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-stone-500">
                {smsState === "locked"
                  ? `Get an instant text for every new lead — included on ${smsPlanLabel}.`
                  : "Get a text the second a new lead comes in, so you can reply while it's hot."}
              </p>
              {(isOwner || smsState !== "locked") && (
                <Link href={smsCta.href} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-800">
                  {smsCta.label} <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {goalSelector}
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
            <div key={q.id} className="anim-rise rounded-2xl border border-stone-200 bg-white p-5 shadow-card transition hover:shadow-card-hover">
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
