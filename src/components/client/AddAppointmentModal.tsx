"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "./SlotPicker";
import type { ApptService } from "./appointments-types";

/** Owner-created booking (walk-in / phone): service + slot + customer → POST /client/bookings. */
export function AddAppointmentModal({
  services,
  defaultDate,
  onClose,
}: {
  services: ApptService[];
  defaultDate?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [service, setService] = React.useState(services[0]?.name ?? "");
  const [slot, setSlot] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service.trim() || !slot || !name.trim()) {
      setError("Add a service, pick a time, and enter the customer's name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: service,
          startAt: slot,
          name,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          data?.error === "slot_unavailable"
            ? "That time is already fully booked — pick another slot."
            : (data?.error ?? `Failed (${res.status})`),
        );
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-stone-900">Add an appointment</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Service
            {services.length > 0 ? (
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="rounded-xl border border-stone-300 px-3 py-2 text-sm font-normal"
              >
                {services.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.durationMinutes}m)
                  </option>
                ))}
              </select>
            ) : (
              <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Consultation" />
            )}
          </label>

          <div className="grid gap-1 text-sm font-medium text-stone-700">
            Time
            <SlotPicker service={service || undefined} value={slot} onChange={setSlot} defaultDate={defaultDate} />
          </div>

          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Customer name
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Email
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              Phone
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Notes
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add appointment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
