"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wand2, Copy, Check, ExternalLink, Sparkles, RefreshCw, Mail, LifeBuoy, Pencil, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/toast";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";

export interface PreviewView {
  id: string;
  status: string;
  publicToken: string | null;
  selectedPlan: string;
  setupDiscountPct: number;
  pendingDiscountPct: number | null;
  monthlyDiscountPct: number;
  pendingMonthlyPct: number | null;
  sentAt: string | null;
}

/** The promotional monthly discount runs for the first year (mirrors MONTHLY_PROMO_MONTHS). */
const PROMO_MONTHS = 12;

/** Per-plan generation capabilities (mirrors what a client of that plan would get), so the rep's
 *  preview form behaves exactly like the client's own — page allowance + whether lead forms apply. */
export type PlanCaps = Record<string, { maxPages: number; canUseForms: boolean }>;

/** Setup + monthly list price per plan (cents) — drives the price the prospect sees. */
export type PreviewPricing = Record<string, { setup: number; monthly: number }>;

const PLAN_LABELS: { value: string; label: string }[] = [
  { value: "NECTAR", label: "Nectar" },
  { value: "HONEY", label: "Honey" },
  { value: "HIVE", label: "Hive" },
];

const ERROR_COPY: Record<string, string> = {
  preview_exists: "This prospect already has a preview for that plan — regenerate it instead.",
  contract_required: "Your agreement must be active to create previews.",
  validation_error: "Add a short description and at least one service.",
  prospect_not_found: "This prospect isn't yours.",
  no_prospect_email: "Add an email to this prospect first, then send.",
  not_ready: "The preview isn't ready yet — give it a moment.",
  already_generating: "A rebuild is already running.",
  no_content: "Type a short message first.",
};

/** Cents → "$1,299" (whole dollars) or "$12.50". */
function money(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const planLabel = (value: string) => PLAN_LABELS.find((p) => p.value === value)?.label ?? value;

/** Per-plan card theming so multiple previews read as visibly separate blocks (and the tier is
 *  recognizable at a glance): a tinted background + a colored left accent bar + a header badge. */
const PLAN_THEME: Record<string, { card: string; badge: string }> = {
  NECTAR: { card: "border-amber-200 border-l-amber-400 bg-amber-50/50", badge: "bg-amber-100 text-amber-800" },
  HONEY: { card: "border-orange-200 border-l-orange-400 bg-orange-50/50", badge: "bg-orange-100 text-orange-800" },
  HIVE: { card: "border-rose-200 border-l-rose-400 bg-rose-50/50", badge: "bg-rose-100 text-rose-800" },
};
const planTheme = (value: string) => PLAN_THEME[value] ?? { card: "border-stone-200 border-l-stone-300 bg-stone-50/40", badge: "bg-stone-100 text-stone-700" };

export function PreviewPanel({
  prospectId,
  previews,
  canRequest,
  appUrl,
  planCaps,
  pricing,
  maxSetupDiscount,
  contactDefaults,
}: {
  prospectId: string;
  previews: PreviewView[];
  canRequest: boolean;
  appUrl: string;
  planCaps: PlanCaps;
  pricing: PreviewPricing;
  maxSetupDiscount: Record<string, number>;
  contactDefaults?: { email?: string; phone?: string };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [plan, setPlan] = React.useState("HONEY");
  const [discount, setDiscount] = React.useState(0);
  const [monthlyDiscount, setMonthlyDiscount] = React.useState(0);

  const usedPlans = new Set(previews.map((p) => p.selectedPlan));
  const availablePlans = PLAN_LABELS.filter((p) => !usedPlans.has(p.value));
  const anyGenerating = previews.some((p) => p.status === "PREVIEW_GENERATING");
  const caps = planCaps[plan] ?? { maxPages: 5, canUseForms: true };

  // Default the offer plan to the first plan not already previewed.
  React.useEffect(() => {
    if (availablePlans.length && !availablePlans.some((p) => p.value === plan)) {
      setPlan(availablePlans[0].value);
    }
  }, [availablePlans, plan]);

  // While any preview is generating, poll so the panel flips to the ready state on its own —
  // generation runs server-side (no socket), so without this the rep sits on a stale "building" view.
  React.useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [anyGenerating, router]);

  // Submit the full intake (assembled by WebsiteIntakeForm — identical to the client's own form)
  // wrapped with the chosen showcase plan + an optional setup-fee discount.
  async function submitPreview(intake: Record<string, unknown>) {
    const res = await fetch("/api/v1/rep/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId, selectedPlan: plan, setupDiscountPct: discount, monthlyDiscountPct: monthlyDiscount, intake }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(ERROR_COPY[d.error ?? ""] ?? "Could not start the preview.");
    }
    const d = (await res.json().catch(() => ({}))) as { discountPending?: boolean };
    toast.success("Building the preview — it'll be ready in under a minute 🐝");
    if (d.discountPending) toast.success("Your discount needs admin approval — sent for sign-off");
    setOpen(false);
    setDiscount(0);
    setMonthlyDiscount(0);
    router.refresh();
  }

  const offerMaxSetup = maxSetupDiscount[plan] ?? 0;
  const offerSetupOverFloor = discount > offerMaxSetup;

  const hasPreviews = previews.length > 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <Sparkles size={16} className="text-amber-500" /> Free website previews
        </h2>
        {hasPreviews ? <span className="text-xs text-stone-400">{previews.length} version{previews.length === 1 ? "" : "s"}</span> : null}
      </div>

      {!canRequest ? (
        <p className="mt-4 text-sm text-stone-400">Your agreement must be active to create previews.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Existing previews — one card per showcase plan. */}
          {previews.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              appUrl={appUrl}
              price={pricing[preview.selectedPlan]}
              maxSetupPct={maxSetupDiscount[preview.selectedPlan] ?? 0}
            />
          ))}

          {/* Offer another (or the first) preview. */}
          {availablePlans.length === 0 ? (
            <p className="text-xs text-stone-400">Every plan has a preview. Regenerate one above to change it.</p>
          ) : !open ? (
            <div className="flex flex-col items-start gap-3">
              {!hasPreviews ? (
                <p className="text-sm text-stone-500">
                  Generate a real AI website for this business — the fastest way to win them over before they pay a cent.
                  It&apos;s the same intake the owner would fill out themselves. You can make one per plan (e.g. a Nectar
                  and a Hive version) to show off the difference.
                </p>
              ) : null}
              <Button variant="primary" onClick={() => setOpen(true)}>
                {hasPreviews ? <Plus size={15} /> : <Wand2 size={15} />}
                {hasPreviews ? "Add another preview" : "Offer a free preview"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              {/* Showcase plan + optional setup-fee discount — the rep-specific fields. The plan picks
                  which plan's site to show off; the discount is a closing concession off the setup fee. */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Showcase plan</span>
                    <select
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {availablePlans.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Setup discount %</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                      className="h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Monthly promo % <span className="text-stone-400">(1st {PROMO_MONTHS} mo)</span></span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={monthlyDiscount}
                      onChange={(e) => setMonthlyDiscount(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                      className="h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </label>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-500 hover:text-stone-800">
                  Cancel
                </button>
              </div>

              {/* Approval tips: a setup discount above the plan's no-approval max, or ANY monthly promo,
                  needs admin sign-off before it applies. */}
              {offerSetupOverFloor ? (
                <p className="text-xs font-medium text-amber-700">
                  ⚠ You&apos;re going below the maximum {offerMaxSetup}% setup discount you can offer on its own — this will need approval from an admin.
                </p>
              ) : null}
              {monthlyDiscount > 0 ? (
                <p className="text-xs font-medium text-amber-700">
                  ⚠ Monthly promos always need admin approval before they apply.
                </p>
              ) : null}

              {/* The exact same intake form a client fills out themselves — remounted per plan so the
                  page allowance / form options reset to that plan's defaults. */}
              <WebsiteIntakeForm
                key={plan}
                submitLabel="Generate preview"
                footerNote="Free preview — no account needed for the prospect to view it."
                maxPages={caps.maxPages}
                canUseForms={caps.canUseForms}
                canBook={false}
                contactDefaults={contactDefaults}
                onSubmit={submitPreview}
                uploadUrl="/api/v1/rep/uploads"
                mediaUrl={null}
                faqUrl="/api/v1/rep/website/faq-suggest"
                uploadFields={{ prospectId }}
                draftKey={null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One generated preview: live embed, share link, actions (send / changes / regenerate / help),
 *  a setup-fee discount editor, and the price the prospect sees. Holds its own busy state so cards
 *  act independently. */
function PreviewCard({
  preview,
  appUrl,
  price,
  maxSetupPct,
}: {
  preview: PreviewView;
  appUrl: string;
  price?: { setup: number; monthly: number };
  maxSetupPct: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [changeNote, setChangeNote] = React.useState("");
  const [showChanges, setShowChanges] = React.useState(false);
  const [helpMsg, setHelpMsg] = React.useState("");
  const [showHelp, setShowHelp] = React.useState(false);
  const [helpSent, setHelpSent] = React.useState(false);
  const [showDiscount, setShowDiscount] = React.useState(false);
  const [discountInput, setDiscountInput] = React.useState(preview.setupDiscountPct);
  const [monthlyInput, setMonthlyInput] = React.useState(preview.monthlyDiscountPct);

  const shareUrl = preview.publicToken ? `${appUrl}/p/${preview.publicToken}` : null;
  const generating = preview.status === "PREVIEW_GENERATING";
  const sent = Boolean(preview.sentAt);
  const pct = preview.setupDiscountPct;
  const pending = preview.pendingDiscountPct;
  const monthlyPct = preview.monthlyDiscountPct;
  const pendingMonthly = preview.pendingMonthlyPct;
  const anyPending = pending != null || pendingMonthly != null;
  const discountedSetup = price ? Math.round(price.setup * (1 - pct / 100)) : 0;
  const discountedMonthly = price ? Math.round(price.monthly * (1 - monthlyPct / 100)) : 0;
  const setupOverFloor = discountInput > maxSetupPct;

  async function copy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  // Shared POST helper for the card's actions. Returns whether it succeeded.
  async function action(url: string, body: Record<string, unknown> | null, okMsg: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
        return true;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(ERROR_COPY[d.error ?? ""] ?? "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const regenerate = () => action(`/api/v1/rep/previews/${preview.id}/regenerate`, null, "Rebuilding the preview 🐝");
  const sendEmail = () => action(`/api/v1/rep/previews/${preview.id}/send-email`, null, "Preview emailed to the prospect ✉️");

  async function requestChanges() {
    const note = changeNote.trim();
    if (!note) return toast.error("Describe the changes first");
    if (await action(`/api/v1/rep/previews/${preview.id}/request-changes`, { note }, "Applying your changes 🐝")) {
      setChangeNote("");
      setShowChanges(false);
    }
  }

  async function requestHelp() {
    const message = helpMsg.trim();
    if (!message) return toast.error("Describe what you need help with");
    if (await action(`/api/v1/rep/help`, { message, previewId: preview.id }, "Help request sent to the team")) {
      setHelpMsg("");
      setShowHelp(false);
      setHelpSent(true);
    }
  }

  // Discount has two outcomes (apply now vs. sent for admin approval), so it doesn't use the generic
  // helper — it reads the response to toast the right thing.
  async function applyDiscount() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/rep/previews/${preview.id}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pct: discountInput, monthlyPct: monthlyInput }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(ERROR_COPY[d.error ?? ""] ?? "Could not set the discount.");
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { pending?: boolean };
      toast.success(d.pending ? "Needs admin approval — sent for sign-off" : "Discount applied");
      setShowDiscount(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const theme = planTheme(preview.selectedPlan);

  return (
    <div className={`space-y-3 rounded-xl border border-l-4 p-3 ${theme.card}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.badge}`}>
          <Sparkles size={13} /> {planLabel(preview.selectedPlan)} preview
        </span>
        <StatusBadge status={preview.status} />
      </div>

      {/* Live, embedded preview — exactly what the prospect sees at /p/{token}. */}
      {shareUrl ? (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          {generating ? (
            <div className="grid h-64 place-items-center text-sm text-stone-400">
              <span className="flex items-center gap-2"><RefreshCw size={15} className="animate-spin" /> Generating…</span>
            </div>
          ) : (
            <iframe
              key={preview.status}
              src={shareUrl}
              title={`${planLabel(preview.selectedPlan)} website preview`}
              className="h-[520px] w-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}
        </div>
      ) : null}

      {/* Price the prospect sees: discounted setup (with strikethrough) + monthly. */}
      {price ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-600">
          <span className="font-medium text-stone-500">Price:</span>
          {pct > 0 ? (
            <span>
              <s className="text-stone-400">{money(price.setup)}</s>{" "}
              <strong className="text-stone-800">{money(discountedSetup)}</strong> setup
              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">{pct}% off</span>
            </span>
          ) : (
            <span><strong className="text-stone-800">{money(price.setup)}</strong> setup</span>
          )}
          <span className="text-stone-400">+</span>
          {monthlyPct > 0 ? (
            <span>
              <s className="text-stone-400">{money(price.monthly)}</s>{" "}
              <strong className="text-stone-800">{money(discountedMonthly)}</strong>/mo for {PROMO_MONTHS} mo
              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">{monthlyPct}% off</span>
            </span>
          ) : (
            <span><strong className="text-stone-800">{money(price.monthly)}</strong>/mo</span>
          )}
          {pending != null ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">{pending}% setup pending approval</span>
          ) : null}
          {pendingMonthly != null ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">{pendingMonthly}% monthly promo pending approval</span>
          ) : null}
        </div>
      ) : null}

      {/* Share link */}
      {shareUrl ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={shareUrl} className="flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost">
              <ExternalLink size={14} /> Open
            </Button>
          </a>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {sent ? (
          <Button size="sm" variant="outline" disabled className="text-emerald-700">
            <Check size={14} /> Sent to prospect
          </Button>
        ) : (
          <Button size="sm" disabled={busy || generating} onClick={sendEmail}>
            <Mail size={14} /> Send to prospect
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy || generating} onClick={() => setShowChanges((v) => !v)}>
          <Pencil size={14} /> Request changes
        </Button>
        <Button size="sm" variant="outline" disabled={busy || generating} onClick={regenerate}>
          <RefreshCw size={14} /> Regenerate
        </Button>
        <Button size="sm" variant="outline" disabled={busy || generating} onClick={() => setShowDiscount((v) => !v)}>
          <Tag size={14} /> {anyPending ? "Discount (pending)" : pct > 0 || monthlyPct > 0 ? `Discount (${[pct > 0 ? `${pct}% setup` : null, monthlyPct > 0 ? `${monthlyPct}% mo` : null].filter(Boolean).join(", ")})` : "Add discount"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowHelp((v) => !v)}>
          <LifeBuoy size={14} /> Technical help{helpSent ? <Check size={13} className="text-emerald-600" /> : null}
        </Button>
        {sent ? <span className="text-xs text-stone-400">Sent {new Date(preview.sentAt!).toLocaleDateString()}</span> : null}
        {helpSent ? <span className="text-xs text-emerald-600">Help request sent ✓</span> : null}
      </div>

      {/* Discount editor — setup fee + a first-year monthly promo */}
      {showDiscount ? (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Setup discount %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={discountInput}
                onChange={(e) => setDiscountInput(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                className="h-9 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Monthly promo % <span className="text-stone-400">(1st {PROMO_MONTHS} mo)</span></span>
              <input
                type="number"
                min={0}
                max={100}
                value={monthlyInput}
                onChange={(e) => setMonthlyInput(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                className="h-9 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            <Button size="sm" disabled={busy} onClick={applyDiscount}>
              <Tag size={14} /> Apply
            </Button>
          </div>
          {price ? (
            <p className="text-xs text-stone-500">
              Setup <strong>{money(Math.round(price.setup * (1 - discountInput / 100)))}</strong> (was {money(price.setup)})
              {monthlyInput > 0 ? (
                <> · Monthly <strong>{money(Math.round(price.monthly * (1 - monthlyInput / 100)))}</strong>/mo for {PROMO_MONTHS} mo, then {money(price.monthly)}</>
              ) : (
                <> · Monthly stays {money(price.monthly)}</>
              )}
            </p>
          ) : null}
          {/* The tip the rep asked for: warn when going past what they can self-approve. */}
          {setupOverFloor ? (
            <p className="text-xs font-medium text-amber-700">
              ⚠ You&apos;re going below the maximum {maxSetupPct}% setup discount you can offer on its own — this will need approval from an admin.
            </p>
          ) : null}
          {monthlyInput > 0 ? (
            <p className="text-xs font-medium text-amber-700">⚠ Monthly promos always need admin approval before they apply.</p>
          ) : null}
        </div>
      ) : null}

      {/* Request changes — free-text → AI regenerates (auto-shown, no admin review) */}
      {showChanges ? (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs font-medium text-stone-500">Describe the changes — the AI applies them and rebuilds the preview.</p>
          <textarea
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            rows={3}
            placeholder="e.g. Make the hero headline punchier and use a warmer color palette."
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <Button size="sm" disabled={busy} onClick={requestChanges}>
            <Wand2 size={14} /> Apply &amp; rebuild
          </Button>
        </div>
      ) : null}

      {/* Technical help — routed to the admin team */}
      {showHelp ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-medium text-stone-500">Stuck on something? Send it to the PageBee team.</p>
          <textarea
            value={helpMsg}
            onChange={(e) => setHelpMsg(e.target.value)}
            rows={3}
            placeholder="Describe the issue you're running into…"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <Button size="sm" disabled={busy} onClick={requestHelp}>
            <LifeBuoy size={14} /> Send to the team
          </Button>
        </div>
      ) : null}
    </div>
  );
}
