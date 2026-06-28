"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Phone, Mail, Building2, NotebookPen, PhoneCall, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  kind: "activity" | "call";
  label: string;
  detail: string;
  createdAt: string;
}

export interface ProspectDetailData {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  timeline: TimelineItem[];
}

const STATUSES = ["new", "contacted", "qualified", "preview_sent", "quoted", "closed", "lost"];

export function ProspectDetail({ data }: { data: ProspectDetailData }) {
  const router = useRouter();
  const [status, setStatus] = React.useState(data.status);
  const [tab, setTab] = React.useState<"note" | "call" | "followup">("note");

  async function patch(body: unknown) {
    const res = await fetch(`/api/v1/rep/prospects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
    return res.ok;
  }

  async function changeStatus(next: string) {
    setStatus(next);
    if (await patch({ status: next })) toast.success(`Moved to ${next.replace("_", " ")}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-stone-900">{data.businessName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              {data.contactName ? (
                <span className="flex items-center gap-1.5">
                  <Building2 size={13} /> {data.contactName}
                </span>
              ) : null}
              {data.email ? (
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> {data.email}
                </span>
              ) : null}
              {data.phone ? (
                <span className="flex items-center gap-1.5">
                  <Phone size={13} /> {data.phone}
                </span>
              ) : null}
            </p>
          </div>
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick-log */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="mb-4 flex gap-2">
          <TabBtn active={tab === "note"} onClick={() => setTab("note")} icon={NotebookPen} label="Log activity" />
          <TabBtn active={tab === "call"} onClick={() => setTab("call")} icon={PhoneCall} label="Call note" />
          <TabBtn active={tab === "followup"} onClick={() => setTab("followup")} icon={CalendarPlus} label="Follow-up" />
        </div>
        {tab === "note" ? <ActivityForm prospectId={data.id} onDone={() => router.refresh()} /> : null}
        {tab === "call" ? <CallNoteForm prospectId={data.id} onDone={() => router.refresh()} /> : null}
        {tab === "followup" ? <FollowUpForm prospectId={data.id} onDone={() => router.refresh()} /> : null}
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">Timeline</h2>
        {data.timeline.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Nothing logged yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.timeline.map((t) => (
              <li key={t.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <div>
                  <p className="text-stone-700">
                    <span className="font-medium capitalize">{t.label}</span> — {t.detail}
                  </p>
                  <p className="text-xs text-stone-400">
                    {new Date(t.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof NotebookPen;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
        active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function usePost(url: string, onDone: () => void, successMsg: string) {
  const [busy, setBusy] = React.useState(false);
  const send = async (body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(successMsg);
        onDone();
      } else {
        toast.error("Something went wrong. Please try again.");
      }
      return res.ok;
    } finally {
      setBusy(false);
    }
  };
  return { busy, send };
}

function ActivityForm({ prospectId, onDone }: { prospectId: string; onDone: () => void }) {
  const { busy, send } = usePost(`/api/v1/rep/prospects/${prospectId}/activities`, onDone, "Activity logged");
  const [type, setType] = React.useState("note");
  const [summary, setSummary] = React.useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ type, summary })) setSummary("");
      }}
      className="space-y-3"
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option value="note">Note</option>
        <option value="email">Email</option>
        <option value="meeting">Meeting</option>
        <option value="call">Call</option>
      </select>
      <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened?" required />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !summary.trim()}>
          {busy ? "Saving…" : "Log"}
        </Button>
      </div>
    </form>
  );
}

function CallNoteForm({ prospectId, onDone }: { prospectId: string; onDone: () => void }) {
  const { busy, send } = usePost(`/api/v1/rep/prospects/${prospectId}/call-notes`, onDone, "Call note saved");
  const [outcome, setOutcome] = React.useState("interested");
  const [note, setNote] = React.useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ outcome, note })) setNote("");
      }}
      className="space-y-3"
    >
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option value="interested">Interested</option>
        <option value="callback">Callback</option>
        <option value="no_answer">No answer</option>
        <option value="not_interested">Not interested</option>
      </select>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call notes…" required />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !note.trim()}>
          {busy ? "Saving…" : "Save call"}
        </Button>
      </div>
    </form>
  );
}

function FollowUpForm({ prospectId, onDone }: { prospectId: string; onDone: () => void }) {
  const { busy, send } = usePost(`/api/v1/rep/prospects/${prospectId}/follow-ups`, onDone, "Follow-up scheduled");
  const [dueAt, setDueAt] = React.useState("");
  const [note, setNote] = React.useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ dueAt: new Date(dueAt).toISOString(), note })) {
          setDueAt("");
          setNote("");
        }
      }}
      className="space-y-3"
    >
      <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reminder note (optional)" />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !dueAt}>
          {busy ? "Scheduling…" : "Schedule"}
        </Button>
      </div>
    </form>
  );
}
