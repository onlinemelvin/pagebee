"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES } from "@/lib/modules/lead/schema";

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

export function ClientInquiries({ inquiries }: { inquiries: InquiryRow[] }) {
  const router = useRouter();
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ id: string; text: string } | null>(null);

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
      setNote({ id, text: "Reply sent ✓" });
      router.refresh();
    } catch {
      setNote({ id, text: "Couldn't send — try again." });
    } finally {
      setBusy(false);
    }
  }

  if (inquiries.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-400">
        No inquiries yet. They&apos;ll appear here when someone contacts you through your website.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {inquiries.map((q) => (
        <div key={q.id} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">{q.name}</p>
              <p className="text-sm text-stone-500">
                {q.email ?? "—"} {q.phone ? `· ${q.phone}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[q.status] ?? "bg-stone-100 text-stone-600")}>
                {q.status}
              </span>
              <select
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                value={q.status}
                onChange={(e) => setStatus(q.id, e.target.value)}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {q.message && <p className="mt-3 text-sm text-stone-700">{q.message}</p>}
          <p className="mt-2 text-xs text-stone-400">{new Date(q.createdAt).toLocaleString()}</p>

          <div className="mt-3">
            {q.email ? (
              replyTo === q.id ? (
                <form onSubmit={(e) => sendReply(q.id, e)} className="grid gap-2">
                  <Textarea name="message" required placeholder={`Reply to ${q.name}…`} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy}>
                      {busy ? "Sending…" : "Send reply"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setReplyTo(q.id); setNote(null); }}>
                  Reply by email
                </Button>
              )
            ) : (
              <span className="text-xs text-stone-400">No email provided — can&apos;t reply.</span>
            )}
            {note?.id === q.id && <p className="mt-2 text-sm text-green-700">{note.text}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
