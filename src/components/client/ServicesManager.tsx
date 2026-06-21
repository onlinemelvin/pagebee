"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Clock, Globe, EyeOff, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SERVICE_ICON_MAP } from "./service-icons";
import { type ServiceDTO, type ServiceDisplay } from "@/lib/modules/service";

type DurationUnit = "min" | "hour" | "day";
const UNIT_TO_MIN: Record<DurationUnit, number> = { min: 1, hour: 60, day: 24 * 60 };
const UNIT_LABEL: Record<DurationUnit, string> = { min: "minutes", hour: "hours", day: "days" };
const MAX_DURATION_MINUTES = 30 * 24 * 60;

/** Quick-pick presets per unit (in that unit's own numbers). */
const DURATION_PRESETS: Record<DurationUnit, number[]> = {
  min: [15, 30, 45, 90],
  hour: [1, 2, 4, 8],
  day: [1, 2, 3, 5],
};

/** Render stored minutes back as the cleanest {value, unit} for editing. */
function splitDuration(mins: number): { value: number; unit: DurationUnit } {
  if (mins > 0 && mins % UNIT_TO_MIN.day === 0) return { value: mins / UNIT_TO_MIN.day, unit: "day" };
  if (mins > 0 && mins % UNIT_TO_MIN.hour === 0) return { value: mins / UNIT_TO_MIN.hour, unit: "hour" };
  return { value: mins, unit: "min" };
}

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/** Compact human label for a stored minutes value (e.g. 2880 → "2 days", 90 → "90 min"). */
function formatDuration(mins: number): string {
  const { value, unit } = splitDuration(mins);
  if (unit === "min") return `${value} min`;
  const noun = value === 1 ? unit : `${unit}s`;
  return `${value} ${noun}`;
}

interface FormState {
  id: string | null;
  isDefault: boolean;
  title: string;
  durationValue: number;
  durationUnit: DurationUnit;
  price: string; // dollars, as typed
  showOnWebsite: boolean;
}

const EMPTY: FormState = {
  id: null,
  isDefault: false,
  title: "",
  durationValue: 60,
  durationUnit: "min",
  price: "",
  showOnWebsite: true,
};

export function ServicesManager({
  services,
  websiteEditsRemaining,
  display,
}: {
  services: ServiceDTO[];
  /** Monthly website-update allowance left; when 0 the "show on website" toggle is locked. */
  websiteEditsRemaining: number;
  /** Owner's website display toggles (show price / show time) for the services section. */
  display: ServiceDisplay;
}) {
  const router = useRouter();
  const noWebsiteEdits = websiteEditsRemaining <= 0;
  const [form, setForm] = React.useState<FormState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null);

  // Website display toggles — optimistic so the checkbox flips instantly while the backend saves.
  const [disp, setDisp] = React.useState<ServiceDisplay>(display);
  React.useEffect(() => setDisp(display), [display]);
  async function toggleDisplay(patch: Partial<ServiceDisplay>) {
    const next = { ...disp, ...patch };
    setDisp(next); // optimistic
    try {
      const res = await fetch("/api/v1/client/services/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) router.refresh();
      else setDisp(disp); // revert
    } catch {
      setDisp(disp);
    }
  }

  function openAdd() {
    setError(null);
    // With no website updates left, a new service can't go live yet — default it off so the
    // disabled (but otherwise checked) toggle can't slip it onto the site.
    setForm({ ...EMPTY, showOnWebsite: !noWebsiteEdits });
  }
  function openEdit(s: ServiceDTO) {
    setError(null);
    const { value, unit } = splitDuration(s.durationMinutes);
    setForm({
      id: s.id,
      isDefault: s.isDefault,
      title: s.title,
      durationValue: value,
      durationUnit: unit,
      price: dollars(s.price),
      showOnWebsite: s.showOnWebsite,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.title.trim()) {
      setError("Give the service a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const durationMinutes = Math.min(
      MAX_DURATION_MINUTES,
      Math.max(5, Math.round((form.durationValue || 0) * UNIT_TO_MIN[form.durationUnit])),
    );
    // icon + description are intentionally omitted: the server's AI fills them from the name
    // on create, and leaves them untouched on edit.
    const payload = {
      title: form.title.trim(),
      durationMinutes,
      price: form.price.trim() ? Math.round(parseFloat(form.price) * 100) : null,
      showOnWebsite: form.showOnWebsite,
    };
    try {
      const res = await fetch(form.id ? `/api/v1/client/services/${form.id}` : "/api/v1/client/services", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/client/services/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        setConfirmDel(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-stone-500">
          Your central catalog. These power the appointment scheduler (title + typical time), feed your
          website, and will be reusable on invoices. The <strong>Other</strong> entry is always available for
          ad-hoc bookings and invoices but never appears on your site.
        </p>
        <Button onClick={openAdd}>
          <Plus size={16} /> Add service
        </Button>
      </div>

      {/* Website display — explicit control over what each service card shows on the live site.
          Overrides the per-site default. Off → no card shows that field; on → only cards that have
          the value show it. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-card">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Website display</span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={disp.showPrice}
            onChange={(e) => toggleDisplay({ showPrice: e.target.checked })}
            className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400"
          />
          Show price
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={disp.showDuration}
            onChange={(e) => toggleDisplay({ showDuration: e.target.checked })}
            className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400"
          />
          Show average time
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const Icon = SERVICE_ICON_MAP[s.icon ?? ""] ?? SERVICE_ICON_MAP.sparkles;
          return (
            <div
              key={s.id}
              className={cn(
                "group anim-rise relative flex flex-col rounded-2xl border p-4 shadow-card transition-shadow hover:shadow-card-hover",
                s.isDefault ? "border-dashed border-stone-300 bg-stone-50" : "border-stone-200 bg-white",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    s.isDefault ? "bg-stone-200 text-stone-500" : "bg-amber-100 text-amber-700",
                  )}
                >
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-1.5 font-semibold text-stone-900">
                    {s.title}
                    {s.isDefault && <Lock size={12} className="text-stone-400" />}
                  </h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> {formatDuration(s.durationMinutes)}
                    </span>
                    {s.price != null && <span className="font-medium text-stone-700">${dollars(s.price)}</span>}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        s.showOnWebsite && !s.isDefault ? "text-green-700" : "text-stone-400",
                      )}
                    >
                      {s.showOnWebsite && !s.isDefault ? <Globe size={12} /> : <EyeOff size={12} />}
                      {s.showOnWebsite && !s.isDefault ? "On website" : "Hidden"}
                    </span>
                  </div>
                </div>
              </div>
              {s.description && <p className="mt-3 line-clamp-3 text-sm text-stone-600">{s.description}</p>}

              {/* The "Other" default is system-managed — no edit/delete. */}
              {s.isDefault ? (
                <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-400">Built-in — always available, never on your website.</p>
              ) : (
                <div className="mt-3 flex items-center gap-1 border-t border-stone-100 pt-3">
                  <button
                    onClick={() => openEdit(s)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  {confirmDel === s.id ? (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <button onClick={() => setConfirmDel(null)} className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100">
                        Keep
                      </button>
                      <button
                        onClick={() => del(s.id)}
                        disabled={busy}
                        className="rounded-lg bg-red-600 px-2 py-1 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDel(s.id)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add tile */}
        <button
          onClick={openAdd}
          className="group flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/50 p-4 text-stone-400 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-amber-500 shadow-sm transition group-hover:scale-110">
            <Plus size={20} />
          </span>
          <span className="text-sm font-semibold">Add a service</span>
        </button>
      </div>

      {/* Add / edit modal */}
      {form && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => !busy && setForm(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-stone-900">{form.id ? "Edit service" : "Add a service"}</h2>
              <button onClick={() => setForm(null)} className="text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            <label className="mt-4 grid gap-1 text-sm font-medium text-stone-700">
              Service name
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={form.isDefault}
                placeholder="e.g. Oil change"
              />
              {form.isDefault && <span className="text-xs font-normal text-stone-400">The Other entry&apos;s name is fixed.</span>}
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 text-sm font-medium text-stone-700">
                Typical time
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={form.durationValue}
                    onChange={(e) => setForm({ ...form, durationValue: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <select
                    value={form.durationUnit}
                    onChange={(e) => setForm({ ...form, durationUnit: e.target.value as DurationUnit })}
                    className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-700"
                    aria-label="Time unit"
                  >
                    {(Object.keys(UNIT_LABEL) as DurationUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {DURATION_PRESETS[form.durationUnit].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm({ ...form, durationValue: d })}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs",
                        form.durationValue === d ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                      )}
                    >
                      {d}
                      {form.durationUnit === "min" ? "m" : form.durationUnit === "hour" ? "h" : "d"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-1 text-sm font-medium text-stone-700">
                Price (optional)
                <div className="flex items-center gap-1">
                  <span className="text-stone-400">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </label>
            </div>

            {!form.isDefault && (
              <div className="mt-4">
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium",
                    noWebsiteEdits ? "text-stone-400" : "text-stone-700",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.showOnWebsite}
                    disabled={noWebsiteEdits}
                    onChange={(e) => setForm({ ...form, showOnWebsite: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-300 accent-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  Show on my website
                </label>
                {noWebsiteEdits && (
                  <p className="mt-1 text-xs text-stone-400">
                    You&apos;re out of website updates this month. Upgrade for more updates — or wait for your monthly
                    edit reset.
                  </p>
                )}
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={save}>
                {busy ? "Saving…" : form.id ? "Save changes" : "Add service"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
