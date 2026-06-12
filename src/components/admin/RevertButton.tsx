"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** One-click revert: snapshots the target version into a new current version and opens it. */
export function RevertButton({ versionId, label = "Revert to this" }: { versionId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function revert() {
    if (!window.confirm("Revert to this version? This creates a new current version with this version's exact content.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/websites/${versionId}/revert`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error ?? `Failed (${res.status})`);
      router.push(`/admin/websites/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={revert}
        disabled={busy}
        className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-50"
      >
        {busy ? "Reverting…" : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
