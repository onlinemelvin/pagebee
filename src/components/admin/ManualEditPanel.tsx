"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Admin fallback for when AI edits aren't enough: edit the version's raw HTML directly. The HTML
 * is fetched on demand (only when the editor opens), so the ~60KB document never weighs down the
 * detail page. Saving recompiles Tailwind and creates a NEW version (the current one stays
 * intact and revertable), then navigates to it.
 */
export function ManualEditPanel({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const apiBase = `/api/v1/admin/websites/${versionId}`;

  async function openEditor() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/html`);
      const data = (await res.json().catch(() => null)) as { html?: string; error?: string } | null;
      if (!res.ok || typeof data?.html !== "string") throw new Error(data?.error ?? `Failed (${res.status})`);
      setValue(data.html);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load HTML");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/edit-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: value }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error ?? `Failed (${res.status})`);
      router.push(`/admin/websites/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-6">
        <Button variant="outline" onClick={openEditor} disabled={loading}>
          {loading ? "Loading…" : "Manual HTML edit"}
        </Button>
        <p className="mt-1 text-xs text-stone-400">
          Edit the raw HTML directly when the AI edits aren&apos;t enough. Saves as a new version.
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-stone-900">Manual HTML edit</h2>
        <span className="text-xs text-stone-400">{value.length.toLocaleString()} chars</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Editing the full document. Tailwind is recompiled on save, so new classes are styled. This
        creates a new version — the current one stays revertable.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        className="mt-3 h-96 w-full resize-y rounded-lg border border-stone-300 p-3 font-mono text-xs leading-relaxed text-stone-800"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save as new version"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
