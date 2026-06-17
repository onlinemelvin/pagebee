"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WebsiteIntakeForm } from "./WebsiteIntakeForm";
import { UpgradeModal } from "./UpgradeModal";
import { nextTier } from "@/lib/plans";

/**
 * Single "make changes" surface for a LIVE site: two actions — a minor "Request an update"
 * (note → surgical edit) and a "Regenerate from scratch" (full intake form) — BOTH gated by the
 * plan's monthly update quota. When the quota is spent, both collapse into the tier upsell.
 */
export function ClientWebsiteChanges({
  quota,
  planName,
  maxPages,
  canBook,
  canUseForms,
}: {
  quota: { allowance: number; used: number; remaining: number };
  planName: string;
  maxPages: number;
  canBook: boolean;
  canUseForms: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<null | "update" | "regen">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [upsell, setUpsell] = React.useState(false);

  const out = quota.remaining <= 0;
  const next = nextTier(planName);

  async function submitUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = (await res.json().catch(() => null)) as { reason?: string; error?: string } | null;
      if (res.status === 409 || data?.reason === "out_of_updates") {
        setUpsell(true);
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? data?.reason ?? `Failed (${res.status})`);
      setSent(true);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div>
        <h2 className="font-display text-xl text-stone-900">Make changes to your website</h2>
        <p className="mt-1 text-sm text-stone-500">
          A quick edit or a full rebuild — <strong>{quota.used} of {quota.allowance}</strong> update
          {quota.allowance === 1 ? "" : "s"} used this month.
        </p>
      </div>

      {sent ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-stone-700">
          ✓ Your change is with our team — we&apos;ll review and publish it to your live site shortly.
        </p>
      ) : out ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-stone-900">
            You&apos;ve used all {quota.allowance} update{quota.allowance === 1 ? "" : "s"} this month.
          </p>
          {next ? (
            <>
              <p className="mt-1 text-sm text-stone-600">
                Upgrade to {next.label} for {next.monthlyUpdates} updates / month.
              </p>
              <Button className="mt-3" onClick={() => setUpsell(true)}>
                Upgrade to {next.label}
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-stone-600">Your updates reset at the start of next month.</p>
          )}
        </div>
      ) : mode === null ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setError(null);
              setMode("update");
            }}
          >
            Request an update
          </Button>
          <Button variant="outline" onClick={() => setMode("regen")}>
            Regenerate from scratch
          </Button>
        </div>
      ) : mode === "update" ? (
        <form onSubmit={submitUpdate} className="mt-4 grid gap-2">
          <p className="text-sm text-stone-500">Describe a minor text, style, or section change to your live site.</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            rows={4}
            placeholder="e.g. update hours, reword the hero, swap a photo…"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !note.trim()}>
              {busy ? "Sending…" : "Send update request"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-500">Rebuild your whole site from updated details — uses one monthly update.</p>
            <button onClick={() => setMode(null)} className="text-sm text-stone-500 hover:underline">
              Cancel
            </button>
          </div>
          <div className="mt-4">
            <WebsiteIntakeForm
              submitLabel="Regenerate from scratch"
              maxPages={maxPages}
              canBook={canBook}
              canUseForms={canUseForms}
            />
          </div>
        </div>
      )}

      {next && <UpgradeModal open={upsell} onClose={() => setUpsell(false)} toPlan={next.name} reason="more_updates" />}
    </div>
  );
}
