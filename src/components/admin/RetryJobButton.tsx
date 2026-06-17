"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Retry a failed generation job — requeues and re-runs it, then refreshes the activity view. */
export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/website-jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={retry}
        disabled={busy}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? "Retrying…" : "Retry"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
