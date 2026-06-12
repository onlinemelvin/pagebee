"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Apply a captured upgrade request — switches the client's plan, then refreshes the list. */
export function ApplyUpgradeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/upgrade-requests/${id}/apply`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={apply}
        disabled={busy}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? "Applying…" : "Apply"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
