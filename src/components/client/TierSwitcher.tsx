"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, ArrowUp, ArrowDown, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, planByName, planRank, tierDiff } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";

type Block = { slug: string; label: string; isPage: boolean };
type ViewData = { blocks: Block[]; selectedPlan: string; keptSections: string[] | null };

function money(cents: number) {
  const sign = cents > 0 ? "+" : "−";
  return `${sign}${formatUsd(Math.abs(cents))}`;
}

/**
 * Free tier switching in preview mode — NO regeneration. Picking a tier shows what you'll gain/lose
 * plus the cost difference; on a downgrade that exceeds the page allowance you choose which
 * pages/sections to keep. Confirming just records the choice (serve-time hides the rest); you pay only
 * at Approve & Launch.
 */
export function TierSwitcher({ currentTierFallback }: { currentTierFallback: string }) {
  const router = useRouter();
  const [data, setData] = React.useState<ViewData | null>(null);
  const [target, setTarget] = React.useState<string | null>(null);
  const [kept, setKept] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/website/tier-view")
      .then((r) => r.json().catch(() => null))
      .then((d: ViewData | null) => active && d && setData(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const current = data?.selectedPlan ?? currentTierFallback;
  const blocks = data?.blocks ?? [];
  const targetPlan = target ? planByName(target) : null;
  const diff = target ? tierDiff(current, target, blocks.length) : null;
  const isDowngrade = diff?.direction === "downgrade";
  const overLimit = targetPlan ? blocks.length > targetPlan.maxPages : false;

  function open(plan: string) {
    setError(null);
    setTarget(plan);
    const tp = planByName(plan);
    if (!tp) return;
    // Seed the keep selection: current choice (if any) ∩ blocks, else the first maxPages, hero always in.
    const base = data?.keptSections?.length ? data.keptSections : blocks.slice(0, tp.maxPages).map((b) => b.slug);
    const first = blocks[0]?.slug;
    const seed = Array.from(new Set([first, ...base].filter(Boolean))).slice(0, tp.maxPages) as string[];
    setKept(seed);
  }

  function toggle(slug: string) {
    if (!targetPlan) return;
    if (blocks[0]?.slug === slug) return; // hero locked
    setKept((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= targetPlan.maxPages) return prev; // at the cap
      return [...prev, slug];
    });
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/tier-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target, keptSections: isDowngrade && overLimit ? kept : undefined }),
      });
      if (!res.ok) throw new Error();
      setTarget(null);
      router.refresh(); // re-serves the preview at the new tier
    } catch {
      setError("Couldn't switch — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <h2 className="font-display text-xl text-stone-900">Choose your plan</h2>
      <p className="mt-1 text-sm text-stone-500">
        Switch tiers freely to see your site on each — nothing is charged until you approve &amp; launch.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.name === current;
          const dir = planRank(p.name) > planRank(current) ? "up" : planRank(p.name) < planRank(current) ? "down" : "same";
          return (
            <button
              key={p.name}
              onClick={() => !isCurrent && open(p.name)}
              disabled={isCurrent}
              className={[
                "rounded-xl border p-4 text-left transition",
                isCurrent ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg text-stone-900">{p.label}</span>
                {isCurrent ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-950">Current</span>
                ) : dir === "up" ? (
                  <ArrowUp size={16} className="text-emerald-500" />
                ) : (
                  <ArrowDown size={16} className="text-stone-400" />
                )}
              </div>
              <p className="mt-1 text-sm text-stone-500">
                ${Math.round(p.monthlyFee / 100)}/mo · {p.maxPages} pages
              </p>
            </button>
          );
        })}
      </div>

      {target && targetPlan && diff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => !busy && setTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-display text-xl text-stone-900">
                {isDowngrade ? "Downgrade" : "Upgrade"} to {targetPlan.label}
              </h3>
              <button onClick={() => setTarget(null)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100" aria-label="Close"><X size={18} /></button>
            </div>

            {/* gain / loss */}
            {diff.gained.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">You&apos;ll gain</p>
                <ul className="mt-1 space-y-1 text-sm text-stone-700">
                  {diff.gained.map((g) => (<li key={g} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />{g}</li>))}
                  {diff.maxPagesTo > diff.maxPagesFrom && <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />Room for {diff.maxPagesTo} pages (up from {diff.maxPagesFrom})</li>}
                </ul>
              </div>
            )}
            {diff.lost.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">You&apos;ll lose</p>
                <ul className="mt-1 space-y-1 text-sm text-stone-700">
                  {diff.lost.map((l) => (<li key={l} className="flex gap-2"><X size={15} className="mt-0.5 shrink-0 text-rose-500" />{l}</li>))}
                  {overLimit && <li className="flex gap-2"><X size={15} className="mt-0.5 shrink-0 text-rose-500" />{blocks.length - targetPlan.maxPages} of your {blocks.length} pages/sections (pick which to keep below)</li>}
                </ul>
              </div>
            )}

            {/* keep-picker on a downgrade that exceeds the allowance */}
            {isDowngrade && overLimit && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-sm font-medium text-stone-800">
                  Keep {targetPlan.maxPages} of {blocks.length} — selected {kept.length}/{targetPlan.maxPages}
                </p>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {blocks.map((b, i) => {
                    const locked = i === 0;
                    const on = kept.includes(b.slug);
                    const atCap = !on && kept.length >= targetPlan.maxPages;
                    return (
                      <label key={b.slug} className={["flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", atCap ? "opacity-40" : "hover:bg-white"].join(" ")}>
                        <input type="checkbox" checked={on} disabled={locked || atCap} onChange={() => toggle(b.slug)} className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400" />
                        <span className="flex-1 text-stone-700">{b.label}</span>
                        {locked && <span className="inline-flex items-center gap-1 text-[11px] text-stone-400"><Lock size={11} /> always kept</span>}
                        {b.isPage && <span className="text-[11px] text-stone-400">page</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* cost + deferred-payment note */}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
              <span className="text-stone-600">
                {diff.monthlyDeltaCents === 0 ? "Same monthly price" : `${money(diff.monthlyDeltaCents)}/mo`}
                {diff.setupDeltaCents > 0 && ` · ${money(diff.setupDeltaCents)} setup`}
              </span>
              <span className="text-xs font-medium text-stone-400">billed at launch</span>
            </div>
            <p className="mt-2 text-xs text-stone-400">No charge now — you only pay when you approve &amp; launch.</p>
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>Cancel</Button>
              <Button onClick={confirm} disabled={busy || (isDowngrade && overLimit && kept.length === 0)}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? "Switching…" : `View on ${targetPlan.label}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
