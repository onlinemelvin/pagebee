"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Admin "regenerate from scratch": re-run a fresh full generation from the same original
 * instructions when the reviewer doesn't like a draft. Two-click confirm, then it polls and
 * navigates the reviewer to the NEW draft once it's built — so they don't keep staring at the
 * old version's preview (the regen lands at a different version URL).
 */
export function RegenerateButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function poll() {
    if (timer.current) return;
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/admin/websites/${versionId}/regenerate`, { cache: "no-store" });
        if (!res.ok) return;
        const { latestVersionId, generating, failed } = (await res.json()) as {
          latestVersionId: string;
          generating: boolean;
          failed: boolean;
        };
        if (failed && !generating) {
          if (timer.current) clearInterval(timer.current);
          setStarted(false);
          setConfirming(true);
          setError("Generation failed — try again.");
          return;
        }
        // New draft built (a newer version exists and nothing is generating) → jump to it.
        if (!generating && latestVersionId && latestVersionId !== versionId) {
          if (timer.current) clearInterval(timer.current);
          router.push(`/admin/websites/${latestVersionId}`);
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/websites/${versionId}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setConfirming(false);
      setStarted(true);
      poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (started) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-amber-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Building a fresh draft — we&apos;ll open it when it&apos;s ready
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-stone-500">Regenerate a fresh draft?</span>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          onClick={regenerate}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Yes, regenerate"}
        </button>
        {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
      title="Re-run a fresh generation from the same original instructions"
    >
      ↻ Regenerate from scratch
    </button>
  );
}
