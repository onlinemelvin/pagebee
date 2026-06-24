"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planByName, tierDiff } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";
import { BillingCardStep } from "./BillingCardStep";

type Block = { slug: string; label: string; isPage: boolean };
type ViewData = { blocks: Block[]; selectedPlan: string; keptSections: string[] | null };

function money(cents: number) {
  return `${cents > 0 ? "+" : "−"}${formatUsd(Math.abs(cents))}`;
}

/**
 * THE universal plan-switch modal — used everywhere a tier change is offered (the billing grid, the
 * website "Choose your plan" panel, locked-feature gates, the "Add features" cards, update/edit
 * upsells). It loads the current tier + site blocks, shows the full diff (features gained/lost, page
 * allowance, price difference), and on a downgrade that exceeds the page allowance lets the owner pick
 * which pages/sections to keep. Confirming calls /website/tier-view, and the SERVER decides:
 *  • pre-launch (or test) → the tier switches in the BACKGROUND for free; the success state stays
 *    until the owner clicks Okay (the page refreshes then).
 *  • live + paid → upgrades collect the setup-fee delta + prorated month here; downgrades route to
 *    billing (scheduled).
 * Driven by parent `open`/`onClose` + the target `toPlan`.
 */
export function UpgradeModal({
  open,
  onClose,
  toPlan,
}: {
  open: boolean;
  onClose: () => void;
  toPlan: string;
  /** Accepted for call-site compatibility; not used. */
  reason?: string;
}) {
  const router = useRouter();
  const plan = planByName(toPlan);
  const [data, setData] = React.useState<ViewData | null>(null);
  const [kept, setKept] = React.useState<string[]>([]);
  const [step, setStep] = React.useState<"confirm" | "pay">("confirm");
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    setStep("confirm");
    setDone(false);
    setBusy(false);
    setError(null);
    setData(null);
    let active = true;
    fetch("/api/v1/client/website/tier-view")
      .then((r) => r.json().catch(() => null))
      .then((d: ViewData | null) => {
        if (!active || !d) return;
        setData(d);
        const tp = planByName(toPlan);
        if (tp) {
          const base = d.keptSections?.length ? d.keptSections : d.blocks.slice(0, tp.maxPages).map((b) => b.slug);
          const first = d.blocks[0]?.slug;
          setKept(Array.from(new Set([first, ...base].filter(Boolean))).slice(0, tp.maxPages) as string[]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, toPlan]);

  if (!open || !plan || !mounted) return null;

  const blocks = data?.blocks ?? [];
  const current = data?.selectedPlan ?? toPlan;
  const diff = tierDiff(current, toPlan, blocks.length);
  const isDowngrade = diff?.direction === "downgrade";
  const overLimit = blocks.length > plan.maxPages;

  function toggle(slug: string) {
    if (blocks[0]?.slug === slug) return; // hero locked
    setKept((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= plan!.maxPages) return prev;
      return [...prev, slug];
    });
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/tier-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: toPlan, keptSections: isDowngrade && overLimit ? kept : undefined }),
      });
      const result = (await res.json().catch(() => null)) as { mode?: string; direction?: string } | null;
      if (!res.ok || !result) {
        setError("Couldn't switch — please try again.");
        setBusy(false);
        return;
      }
      if (result.mode === "payment") {
        if (result.direction === "downgrade") {
          router.push("/client/billing");
          return;
        }
        setStep("pay");
        setBusy(false);
        return;
      }
      setDone(true); // background switch applied — keep the modal until Okay
      setBusy(false);
    } catch {
      setError("Couldn't switch — please try again.");
      setBusy(false);
    }
  }

  function onPaid(r: "applied" | "requested") {
    if (r === "applied") setDone(true);
  }

  function finishAndClose() {
    router.refresh();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => !busy && (done ? finishAndClose() : onClose())}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <p className="mt-3 font-display text-xl text-stone-900">You&apos;re on {plan.label}</p>
            <p className="mt-1 text-sm text-stone-600">Your {plan.label} features are unlocked. You only pay when you approve &amp; launch.</p>
            <Button className="mt-5" onClick={finishAndClose}>Okay</Button>
          </div>
        ) : step === "pay" ? (
          <>
            <h2 className="font-display text-xl text-stone-900">Upgrade to {plan.label}</h2>
            <p className="mt-1 text-sm text-stone-600">Pay the setup-fee difference + prorated month to switch your live plan.</p>
            <div className="mt-4">
              <BillingCardStep flow="upgrade" toPlan={toPlan} onResolved={onPaid} />
            </div>
            <button onClick={onClose} className="mt-3 w-full text-center text-sm text-stone-500 hover:text-stone-700">Cancel</button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <h2 className="font-display text-xl text-stone-900">
                {isDowngrade ? "Downgrade" : "Switch"} to {plan.label}
              </h2>
              <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close"><X size={18} /></button>
            </div>
            <p className="mt-1 text-sm text-stone-600">{plan.tagline}</p>

            {!data ? (
              <p className="py-6 text-center text-sm text-stone-400">Loading…</p>
            ) : (
              <>
                {diff && diff.gained.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">You&apos;ll gain</p>
                    <ul className="mt-1 space-y-1 text-sm text-stone-700">
                      {diff.gained.map((g) => (<li key={g} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />{g}</li>))}
                      {diff.maxPagesTo > diff.maxPagesFrom && <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />Room for {diff.maxPagesTo} pages (up from {diff.maxPagesFrom})</li>}
                    </ul>
                  </div>
                )}
                {diff && diff.lost.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">You&apos;ll lose</p>
                    <ul className="mt-1 space-y-1 text-sm text-stone-700">
                      {diff.lost.map((l) => (<li key={l} className="flex gap-2"><X size={15} className="mt-0.5 shrink-0 text-rose-500" />{l}</li>))}
                      {isDowngrade && overLimit && <li className="flex gap-2"><X size={15} className="mt-0.5 shrink-0 text-rose-500" />{blocks.length - plan.maxPages} of your {blocks.length} pages/sections (pick which to keep below)</li>}
                    </ul>
                  </div>
                )}

                {/* If neither gain nor loss has features (e.g. no website yet), still show the plan's perks. */}
                {diff && diff.gained.length === 0 && diff.lost.length === 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm text-stone-700">
                    {plan.highlights.slice(0, 4).map((h, i) => (<li key={i} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-amber-500" />{h}</li>))}
                  </ul>
                )}

                {isDowngrade && overLimit && (
                  <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <p className="text-sm font-medium text-stone-800">Keep {plan.maxPages} of {blocks.length} — selected {kept.length}/{plan.maxPages}</p>
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                      {blocks.map((b, i) => {
                        const locked = i === 0;
                        const on = kept.includes(b.slug);
                        const atCap = !on && kept.length >= plan.maxPages;
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

                <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                  <span className="text-stone-600">
                    {diff && diff.monthlyDeltaCents !== 0 ? `${money(diff.monthlyDeltaCents)}/mo` : "Same monthly price"}
                    {diff && diff.setupDeltaCents > 0 && ` · ${money(diff.setupDeltaCents)} setup`}
                  </span>
                  <span className="text-xs font-medium text-stone-400">billed at launch</span>
                </div>
                <p className="mt-2 text-xs text-stone-400">No charge now — you only pay the setup fee + first month when you approve &amp; launch.</p>
              </>
            )}

            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={confirm} disabled={busy || !data || (isDowngrade && overLimit && kept.length === 0)}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? "Switching…" : `Switch to ${plan.label}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
