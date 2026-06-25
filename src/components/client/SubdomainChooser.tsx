"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Globe, Check, Loader2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CustomDomainPanel } from "./CustomDomainPanel";
import { UpgradeModal } from "./UpgradeModal";
import type { DomainState } from "@/lib/modules/website";

type Check = { subdomain: string; available: boolean; reason?: "too_short" | "reserved" | "taken" };

const REASON: Record<string, string> = {
  too_short: "At least 3 characters.",
  reserved: "That name is reserved — try another.",
  taken: "That address is taken — try another.",
};

/**
 * Choose your web address. Defaults to the business slug, checks availability live, and saves the
 * subdomain. Also upsells a real custom domain: "Get <name>.com" → the buy flow (availability + AI
 * suggestions + price cap) when the plan includes it, or a plan upgrade when it doesn't.
 */
export function SubdomainChooser({
  customDomain,
  domainState,
  testModeActive,
  upsellPlan,
}: {
  customDomain: boolean;
  domainState: DomainState | null;
  testModeActive?: boolean;
  /** Plan that unlocks custom domains (for the upsell when the current plan doesn't include it). */
  upsellPlan?: { name: string; label: string };
}) {
  const router = useRouter();
  const [root, setRoot] = React.useState("pagebee.com");
  const [value, setValue] = React.useState("");
  const [saved, setSaved] = React.useState("");
  const [check, setCheck] = React.useState<Check | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [domainOpen, setDomainOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Load the current address.
  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/website/address")
      .then((r) => r.json().catch(() => null))
      .then((d: { subdomain?: string; rootDomain?: string } | null) => {
        if (!active || !d) return;
        if (d.rootDomain) setRoot(d.rootDomain);
        if (d.subdomain) {
          setValue(d.subdomain);
          setSaved(d.subdomain);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Debounced availability check as they type (skip when unchanged from the saved value).
  React.useEffect(() => {
    if (!value || value === saved) {
      setCheck(null);
      return;
    }
    setChecking(true);
    const id = setTimeout(() => {
      fetch("/api/v1/client/website/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: value, check: true }),
      })
        .then((r) => r.json().catch(() => null))
        .then((d: Check | null) => d && setCheck(d))
        .catch(() => {})
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(id);
  }, [value, saved]);

  const dirty = value !== saved && value.length > 0;
  const canSave = dirty && check?.available === true && !saving;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/client/website/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: value }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; subdomain?: string } | null;
      if (res.ok && d?.subdomain) {
        setSaved(d.subdomain);
        setValue(d.subdomain);
        setCheck(null);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const liveBase = saved || value || "your-site";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><Globe size={18} /></span>
        <div>
          <h2 className="font-display text-xl text-stone-900">Your web address</h2>
          <p className="text-sm text-stone-500">Pick the address where your site lives.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-xl border border-stone-300 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/40">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="your-business"
            className="h-11 min-w-0 flex-1 rounded-l-xl bg-transparent px-4 text-sm outline-none"
          />
          <span className="select-none px-3 text-sm text-stone-400">.{root}</span>
        </div>
        <Button onClick={save} disabled={!canSave}>{saving ? "Saving…" : "Save"}</Button>
      </div>

      {/* status line */}
      <div className="mt-2 min-h-[20px] text-sm">
        {!dirty && saved && (
          <span className="text-stone-500">
            Live at <span className="font-medium text-stone-700">{liveBase}.{root}</span>
          </span>
        )}
        {dirty && checking && <span className="inline-flex items-center gap-1.5 text-stone-400"><Loader2 size={13} className="animate-spin" /> Checking…</span>}
        {dirty && !checking && check?.available && (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600"><Check size={14} /> {check.subdomain}.{root} is available</span>
        )}
        {dirty && !checking && check && !check.available && (
          <span className="text-rose-600">{REASON[check.reason ?? "taken"] ?? "Not available."}</span>
        )}
      </div>

      {/* Custom-domain upsell */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-4 py-3">
        <Sparkles size={15} className="text-amber-500" />
        <span className="text-sm text-stone-600">
          Want your own domain like <span className="font-medium text-stone-800">{liveBase}.com</span>?
        </span>
        <button
          onClick={() => (customDomain ? setDomainOpen(true) : setPlanOpen(true))}
          className="ml-auto text-sm font-semibold text-amber-700 underline-offset-2 hover:underline"
        >
          {customDomain ? `Get ${liveBase}.com →` : "Upgrade for a custom domain →"}
        </button>
      </div>

      {/* Domain buy flow, seeded with the chosen name */}
      {domainOpen && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={() => setDomainOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><Globe size={18} /></span>
                  <div>
                    <h2 className="font-display text-xl text-stone-900">Get your own domain</h2>
                    <p className="text-sm text-stone-500">We&apos;ll register &amp; set it up for you.</p>
                  </div>
                </div>
                <button onClick={() => setDomainOpen(false)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="mt-4">
                <CustomDomainPanel initial={domainState} testModeActive={testModeActive} bare initialBuyKeyword={liveBase} />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {upsellPlan && <UpgradeModal open={planOpen} onClose={() => setPlanOpen(false)} toPlan={upsellPlan.name} />}
    </div>
  );
}
