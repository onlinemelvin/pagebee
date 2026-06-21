"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  category: string;
}

const CATEGORIES = ["ANNOUNCEMENT", "TIPS", "PROMOTION", "WELCOME", "USAGE"];

export function TemplateManager({ initial }: { initial: TemplateRow[] }) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("ANNOUNCEMENT");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setError(null);
    if (!name || !subject || !bodyHtml) {
      setError("All fields are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, category, bodyHtml }),
      });
      const data = (await res.json()) as { template?: TemplateRow; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error === "name_taken" ? "A template with that name already exists." : "Failed to save.");
      setTemplates((prev) => [data.template!, ...prev]);
      setName("");
      setSubject("");
      setBodyHtml("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/v1/admin/email/templates/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end">
        <Button onClick={() => setOpen((v) => !v)} variant={open ? "ghost" : "primary"}>
          <Plus size={15} /> {open ? "Cancel" : "New template"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-cat">Category</Label>
              <select id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-subj">Subject</Label>
            <Input id="t-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-body">Body (HTML)</Label>
            <textarea id="t-body" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={8} className="rounded-lg border border-stone-300 p-3 font-mono text-xs" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={create} disabled={busy}>{busy ? "Saving…" : "Save template"}</Button>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-800">{t.name}</p>
                <p className="truncate text-xs text-stone-400">{t.subject}</p>
              </div>
              <button onClick={() => remove(t.id)} className="text-stone-400 hover:text-rose-600" aria-label="Delete template">
                <Trash2 size={15} />
              </button>
            </div>
            <span className="mt-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">{t.category}</span>
          </div>
        ))}
        {templates.length === 0 && <p className="text-sm text-stone-400">No saved templates yet.</p>}
      </div>
    </div>
  );
}
