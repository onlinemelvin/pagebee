"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewInfo } from "@/lib/modules/client";

export function PreviewPanel({ preview }: { preview: PreviewInfo }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [revising, setRevising] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Something went wrong");
      }
      setRevising(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // Generating (initial or revision in progress)
  if (preview.status === "PREVIEW_GENERATING" || preview.status === "REVISION_REQUESTED") {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
        <p className="font-medium text-stone-900">Building your preview…</p>
        <p className="mt-1 text-sm text-stone-600">This takes a minute. You can leave and come back.</p>
      </section>
    );
  }

  if (preview.awaitingPayment) {
    return (
      <section className="rounded-2xl border border-amber-400 bg-amber-50 p-6">
        <h2 className="font-display text-xl text-stone-900">You approved your preview 🎉</h2>
        <p className="mt-1 text-stone-600">
          Pay the one-time setup fee to launch your site, connect your domain, and activate your
          features. (Card payments are connecting soon.)
        </p>
        <a href="/client/billing" className="mt-4 inline-block">
          <Button size="lg">Go to billing</Button>
        </a>
      </section>
    );
  }

  if (!preview.ready) return null;

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-stone-900">Your free preview is ready</h2>
        {preview.daysLeft != null && (
          <span className="text-xs font-semibold text-amber-800">Expires in {preview.daysLeft} day{preview.daysLeft === 1 ? "" : "s"}</span>
        )}
      </div>
      <p className="mt-1 text-stone-600">
        Take a look. Approve to launch, or request one change. You have{" "}
        <strong>{preview.revisionsLeft}</strong> free revision{preview.revisionsLeft === 1 ? "" : "s"} left.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {preview.url && (
          <a href={preview.url} target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline">View preview ↗</Button>
          </a>
        )}
        <Button size="lg" disabled={busy} onClick={() => call("/api/v1/client/preview/approve")}>
          Approve &amp; launch
        </Button>
        {preview.revisionsLeft > 0 && !revising && (
          <Button size="lg" variant="ghost" disabled={busy} onClick={() => setRevising(true)}>
            Request a change
          </Button>
        )}
      </div>

      {revising && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "");
            void call("/api/v1/client/preview/request-revision", { note });
          }}
        >
          <Textarea name="note" required placeholder="What would you like changed? (e.g. warmer colors, add a gallery, different hero text)" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Sending…" : "Submit change"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRevising(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
