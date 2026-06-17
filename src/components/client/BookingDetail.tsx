"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STATUS_STYLES, type Appt } from "./appointments-types";

const INV_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-green-100 text-green-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  DECLINED: "bg-red-100 text-red-700",
};

interface Change {
  action: string;
  fromStartAt?: string;
  toStartAt?: string;
  reason?: string | null;
  at: string;
}

const ACTION_LABEL: Record<string, string> = {
  "booking.created": "Requested",
  "booking.created_manual": "Created",
  "booking.confirmed": "Confirmed",
  "booking.rescheduled": "Rescheduled",
  "booking.cancelled": "Cancelled",
  "booking.completed": "Completed",
  "booking.no_show": "Marked no-show",
};

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Slide-over: customer + actions, manual date/time edit with a reason, and change history. */
export function BookingDetail({ appt, history, financeEnabled = false, onClose }: { appt: Appt; history: Appt[]; financeEnabled?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [invBusy, setInvBusy] = React.useState(false);

  async function createInvoice() {
    setInvBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/client/bookings/${appt.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: "INVOICE" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Failed (${res.status})`);
      }
      const { document } = (await res.json()) as { document: { id: string } };
      router.push(`/client/invoices/${document.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setInvBusy(false);
    }
  }
  const [date, setDate] = React.useState(() => localDate(appt.startAt));
  const [time, setTime] = React.useState(() => localTime(appt.startAt));
  const [reason, setReason] = React.useState("");
  const [changes, setChanges] = React.useState<Change[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/v1/client/bookings/${appt.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setChanges((d?.history as Change[]) ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [appt.id]);

  async function patch(body: Record<string, unknown>, close = true) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/client/bookings/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          data?.error === "slot_unavailable"
            ? "That time is already fully booked — pick another."
            : (data?.error ?? `Failed (${res.status})`),
        );
      }
      router.refresh();
      if (close) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/client/bookings/${appt.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  const start = new Date(appt.startAt);
  const active = appt.status === "REQUESTED" || appt.status === "CONFIRMED" || appt.status === "RESCHEDULED";
  const changed = `${date}T${time}` !== `${localDate(appt.startAt)}T${localTime(appt.startAt)}`;

  function updateTime() {
    const iso = new Date(`${date}T${time}`).toISOString();
    void patch({ startAt: iso, reason: reason || undefined });
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-stone-900/40" onMouseDown={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[appt.status] ?? "bg-stone-100 text-stone-600")}>
              {appt.status}
            </span>
            <h2 className="mt-2 font-display text-xl text-stone-900">{appt.serviceName}</h2>
            <p className="mt-1 text-sm text-stone-600">{start.toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Customer</p>
          <p className="mt-1 font-medium text-stone-900">{appt.customerName ?? "—"}</p>
          <div className="mt-1 space-y-0.5 text-sm">
            {appt.customerEmail && <a href={`mailto:${appt.customerEmail}`} className="block text-amber-700 hover:underline">{appt.customerEmail}</a>}
            {appt.customerPhone && <a href={`tel:${appt.customerPhone}`} className="block text-amber-700 hover:underline">{appt.customerPhone}</a>}
          </div>
          {appt.notes && <p className="mt-2 text-sm text-stone-600">{appt.notes}</p>}
        </div>

        {/* Invoice link — shows whether this appointment has been invoiced/sent/paid (Finance plans). */}
        {financeEnabled && (
          <div className="mt-4 rounded-xl border border-stone-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Invoice</p>
            {appt.invoice ? (
              <button onClick={() => router.push(`/client/invoices/${appt.invoice!.id}`)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-left hover:bg-stone-50">
                <span className="flex items-center gap-2 text-sm text-stone-700"><FileText size={15} className="text-stone-400" /> {appt.invoice.docType === "INVOICE" ? "Invoice" : appt.invoice.docType.toLowerCase()}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", INV_STATUS_STYLE[appt.invoice.status] ?? "bg-stone-100 text-stone-600")}>{appt.invoice.status.replace("_", " ")}</span>
                  <ArrowRight size={14} className="text-stone-400" />
                </span>
              </button>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-stone-500">Not invoiced yet.</p>
                <Button size="sm" className="mt-2" disabled={invBusy} onClick={createInvoice}>
                  <FileText size={14} /> {invBusy ? "Creating…" : "Create invoice"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Status actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {appt.status === "REQUESTED" && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "CONFIRMED" })}>
              Confirm
            </Button>
          )}
          {(appt.status === "CONFIRMED" || appt.status === "RESCHEDULED") && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "COMPLETED" })}>
                Completed
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: "NO_SHOW" })}>
                No-show
              </Button>
            </>
          )}
          {active && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: "CANCELLED" })}>
              Cancel
            </Button>
          )}
        </div>

        {/* Manual reschedule with reason */}
        {active && (
          <div className="mt-5 rounded-xl border border-stone-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Change date &amp; time</p>
            <div className="mt-2 flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
            </div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason for the change (optional) — included in the customer's email"
              className="mt-2"
            />
            <Button size="sm" className="mt-2" disabled={busy || !changed} onClick={updateTime}>
              {busy ? "Updating…" : "Update time"}
            </Button>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {/* Change history */}
        {changes.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">History</p>
            <ul className="mt-2 space-y-2">
              {changes.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium text-stone-800">{ACTION_LABEL[c.action] ?? c.action}</span>
                  <span className="text-stone-400"> · {new Date(c.at).toLocaleString()}</span>
                  {c.fromStartAt && c.toStartAt && (
                    <p className="text-xs text-stone-500">
                      {new Date(c.fromStartAt).toLocaleString()} → {new Date(c.toStartAt).toLocaleString()}
                    </p>
                  )}
                  {c.reason && <p className="text-xs italic text-stone-500">“{c.reason}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Customer's other appointments */}
        {history.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Customer history ({history.length})</p>
            <ul className="mt-2 divide-y divide-stone-100">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-stone-700">{h.serviceName}</span>
                  <span className="text-stone-400">{new Date(h.startAt).toLocaleDateString()}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[h.status] ?? "bg-stone-100 text-stone-600")}>{h.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Danger zone: permanently remove the booking */}
        <div className="mt-6 border-t border-stone-100 pt-4">
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-600">Delete this appointment permanently?</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDel(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={del}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
            >
              Delete appointment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
