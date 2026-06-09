"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AppointmentRow {
  id: string;
  serviceName: string;
  startAt: string;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-stone-200 text-stone-600",
  RESCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-teal-100 text-teal-800",
  NO_SHOW: "bg-red-100 text-red-700",
};

export function ClientAppointments({ appointments }: { appointments: AppointmentRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/v1/client/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Couldn't update — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (appointments.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-400">
        No appointments yet. Booking requests from your website will appear here.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {appointments.map((a) => (
        <div key={a.id} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">{a.serviceName}</p>
              <p className="text-sm text-stone-600">{new Date(a.startAt).toLocaleString()}</p>
              <p className="mt-1 text-sm text-stone-500">
                {a.customerName ?? "—"}
                {a.customerEmail ? ` · ${a.customerEmail}` : ""}
                {a.customerPhone ? ` · ${a.customerPhone}` : ""}
              </p>
              {a.notes && <p className="mt-1 text-sm text-stone-500">{a.notes}</p>}
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[a.status] ?? "bg-stone-100 text-stone-600")}>
              {a.status}
            </span>
          </div>

          {(a.status === "REQUESTED" || a.status === "CONFIRMED") && (
            <div className="mt-3 flex gap-2">
              {a.status === "REQUESTED" && (
                <Button size="sm" disabled={busy === a.id} onClick={() => setStatus(a.id, "CONFIRMED")}>
                  Confirm
                </Button>
              )}
              {a.status === "CONFIRMED" && (
                <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => setStatus(a.id, "COMPLETED")}>
                  Mark completed
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => setStatus(a.id, "CANCELLED")}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
