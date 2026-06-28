"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, ExternalLink, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ResourceItemRow {
  id: string;
  title: string;
  url: string;
  group: string;
}
export interface ResourceGroupRow {
  group: string;
  items: ResourceItemRow[];
}

export function ResourceManager({ initialGroups }: { initialGroups: ResourceGroupRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ title: "", url: "", group: "" });

  const groupSuggestions = [...new Set(initialGroups.map((g) => g.group))];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error === "validation_error" ? "Title, a valid URL, and a group are required." : "Could not add resource.");
        return;
      }
      setForm({ title: "", url: "", group: "" });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/resources/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <BookOpen size={16} /> Rep resources
        </h2>
        <Button size="sm" variant={adding ? "ghost" : "outline"} onClick={() => setAdding((v) => !v)}>
          {adding ? <X size={14} /> : <Plus size={14} />} {adding ? "Cancel" : "Add resource"}
        </Button>
      </div>

      {adding ? (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required />
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" required />
            <Input
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value })}
              placeholder="Group (e.g. Pitch & scripts)"
              list="resource-groups"
              required
            />
            <datalist id="resource-groups">
              {groupSuggestions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      ) : null}

      {initialGroups.length === 0 ? (
        <p className="text-sm text-stone-400">No resources yet.</p>
      ) : (
        <div className="space-y-4">
          {initialGroups.map((g) => (
            <div key={g.group} className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{g.group}</p>
              <ul className="mt-2 divide-y divide-stone-100">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center gap-1.5 text-stone-700 hover:text-amber-700"
                    >
                      {item.title} <ExternalLink size={12} className="text-stone-400" />
                    </a>
                    <button
                      onClick={() => remove(item.id)}
                      disabled={busy}
                      className="text-stone-400 hover:text-rose-600"
                      aria-label="Delete resource"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
