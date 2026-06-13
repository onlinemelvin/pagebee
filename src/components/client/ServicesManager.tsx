"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Clock, Globe, EyeOff, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SERVICE_ICON_MAP } from "./service-icons";
import { SERVICE_ICONS, type ServiceDTO } from "@/lib/modules/service";

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

interface FormState {
  id: string | null;
  isDefault: boolean;
  title: string;
  description: string;
  icon: string;
  durationMinutes: number;
  price: string; // dollars, as typed
  showOnWebsite: boolean;
}

const EMPTY: FormState = {
  id: null,
  isDefault: false,
  title: "",
  description: "",
  icon: "sparkles",
  durationMinutes: 60,
  price: "",
  showOnWebsite: true,
};

export function ServicesManager({ services }: { services: ServiceDTO[] }) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null);

  function openAdd() {
    setError(null);
    setForm({ ...EMPTY });
  }
  function openEdit(s: ServiceDTO) {
    setError(null);
    setForm({
      id: s.id,
      isDefault: s.isDefault,
      title: s.title,
      description: s.description ?? "",
      icon: s.icon ?? "sparkles",
      durationMinutes: s.durationMinutes,
      price: dollars(s.price),
      showOnWebsite: s.showOnWebsite,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.title.trim()) {
      setError("Give the service a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      icon: form.icon || null,
      durationMinutes: form.durationMinutes,
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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const Icon = SERVICE_ICON_MAP[s.icon ?? ""] ?? SERVICE_ICON_MAP.sparkles;
          return (
            <div
              key={s.id}
              className={cn(
                "group anim-rise relative flex flex-col rounded-2xl border p-4 transition-shadow hover:shadow-sm",
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
                      <Clock size={12} /> {s.durationMinutes} min
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

            {/* Icon picker */}
            <p className="mt-4 text-sm font-medium text-stone-700">Icon</p>
            <div className="mt-2 grid grid-cols-7 gap-1.5 sm:grid-cols-10">
              {SERVICE_ICONS.map((key) => {
                const Icon = SERVICE_ICON_MAP[key];
                const selected = form.icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, icon: key })}
                    className={cn(
                      "grid aspect-square place-items-center rounded-lg border transition-colors",
                      selected ? "border-amber-400 bg-amber-100 text-amber-700" : "border-stone-200 text-stone-500 hover:bg-stone-100",
                    )}
                    aria-label={key}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>

            <label className="mt-4 grid gap-1 text-sm font-medium text-stone-700">
              Title
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={form.isDefault}
                placeholder="e.g. Oil change"
              />
              {form.isDefault && <span className="text-xs font-normal text-stone-400">The Other entry's name is fixed.</span>}
            </label>

            <label className="mt-3 grid gap-1 text-sm font-medium text-stone-700">
              Description
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description shown on your website."
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 text-sm font-medium text-stone-700">
                Typical time
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Math.max(5, Number(e.target.value) || 5) })}
                    className="w-24"
                  />
                  <span className="text-sm text-stone-400">min</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm({ ...form, durationMinutes: d })}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs",
                        form.durationMinutes === d ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                      )}
                    >
                      {d}m
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
                <span className="text-xs font-normal text-stone-400">Used on invoices later.</span>
              </label>
            </div>

            {!form.isDefault && (
              <label className="mt-4 flex items-center gap-2 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={form.showOnWebsite}
                  onChange={(e) => setForm({ ...form, showOnWebsite: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 accent-amber-500"
                />
                Show on my website
              </label>
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
