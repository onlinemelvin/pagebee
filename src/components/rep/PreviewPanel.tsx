"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wand2, Copy, Check, ExternalLink, Send, Sparkles, RefreshCw, Mail, LifeBuoy, Pencil } from "lucide-react";
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
  sentAt: string | null;
}

/** Per-plan generation capabilities (mirrors what a client of that plan would get), so the rep's
 *  preview form behaves exactly like the client's own — page allowance + whether lead forms apply. */
export type PlanCaps = Record<string, { maxPages: number; canUseForms: boolean }>;

const PLAN_LABELS: { value: string; label: string }[] = [
  { value: "NECTAR", label: "Nectar" },
  { value: "HONEY", label: "Honey" },
  { value: "HIVE", label: "Hive" },
];

const ERROR_COPY: Record<string, string> = {
  preview_exists: "This prospect already has a preview.",
  contract_required: "Your agreement must be active to create previews.",
  validation_error: "Add a short description and at least one service.",
  prospect_not_found: "This prospect isn't yours.",
  no_prospect_email: "Add an email to this prospect first, then send.",
  not_ready: "The preview isn't ready yet — give it a moment.",
  already_generating: "A rebuild is already running.",
  no_content: "Type a short message first.",
};

export function PreviewPanel({
  prospectId,
  preview,
  canRequest,
  appUrl,
  planCaps,
  contactDefaults,
}: {
  prospectId: string;
  preview: PreviewView | null;
  canRequest: boolean;
  appUrl: string;
  planCaps: PlanCaps;
  contactDefaults?: { email?: string; phone?: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [plan, setPlan] = React.useState("HONEY");
  const [changeNote, setChangeNote] = React.useState("");
  const [showChanges, setShowChanges] = React.useState(false);
  const [helpMsg, setHelpMsg] = React.useState("");
  const [showHelp, setShowHelp] = React.useState(false);

  const shareUrl = preview?.publicToken ? `${appUrl}/p/${preview.publicToken}` : null;
  const generating = preview?.status === "PREVIEW_GENERATING";
  const caps = planCaps[plan] ?? { maxPages: 5, canUseForms: true };

  // While generating, poll the server so the panel flips to the ready state on its own — generation
  // runs server-side (no socket), so without this the rep would sit on a stale "building" view.
  React.useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [generating, router]);

  // Submit the full intake (assembled by WebsiteIntakeForm — identical to the client's own form) wrapped
  // with the chosen showcase plan. Throw a friendly message on failure so the form surfaces it inline.
  async function submitPreview(intake: Record<string, unknown>) {
    const res = await fetch("/api/v1/rep/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId, selectedPlan: plan, intake }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(ERROR_COPY[d.error ?? ""] ?? "Could not start the preview.");
    }
    toast.success("Building the preview — it'll be ready in under a minute 🐝");
    router.refresh();
  }

  async function markSent() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/rep/previews/${preview.id}/send`, { method: "POST" });
      if (res.ok) {
        toast.success("Marked as sent");
        router.refresh();
      } else {
        toast.error("Could not update the preview");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  // Shared POST helper for the preview actions (regenerate / request-changes / send-email / help).
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

  async function regenerate() {
    if (!preview) return;
    await action(`/api/v1/rep/previews/${preview.id}/regenerate`, null, "Rebuilding the preview 🐝");
  }

  async function requestChanges() {
    if (!preview) return;
    const note = changeNote.trim();
    if (!note) return toast.error("Describe the changes first");
    if (await action(`/api/v1/rep/previews/${preview.id}/request-changes`, { note }, "Applying your changes 🐝")) {
      setChangeNote("");
      setShowChanges(false);
    }
  }

  async function sendEmail() {
    if (!preview) return;
    await action(`/api/v1/rep/previews/${preview.id}/send-email`, null, "Preview emailed to the prospect ✉️");
  }

  async function requestHelp() {
    if (!preview) return;
    const message = helpMsg.trim();
    if (!message) return toast.error("Describe what you need help with");
    if (await action(`/api/v1/rep/help`, { message, previewId: preview.id }, "Help request sent to the team")) {
      setHelpMsg("");
      setShowHelp(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <Sparkles size={16} className="text-amber-500" /> Free website preview
        </h2>
        {preview ? <StatusBadge status={preview.status} /> : null}
      </div>

      {!preview ? (
        <div className="mt-4">
          {!canRequest ? (
            <p className="text-sm text-stone-400">Your agreement must be active to create previews.</p>
          ) : !open ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-stone-500">
                Generate a real AI website for this business — the fastest way to win them over before they pay a cent.
                It&apos;s the same intake the owner would fill out themselves.
              </p>
              <Button onClick={() => setOpen(true)}>
                <Wand2 size={15} /> Offer a free preview
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Showcase plan — the one field that's rep-specific; it picks which plan's site to show off
                  and drives the same page allowance / lead-form behavior the owner would get on that plan. */}
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-stone-500">Showcase plan</span>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {PLAN_LABELS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-500 hover:text-stone-800">
                  Cancel
                </button>
              </div>

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
      ) : (
        <div className="mt-4 space-y-4">
          {generating ? (
            <p className="text-sm text-amber-700">🐝 Building the preview — this updates on its own in under a minute.</p>
          ) : (
            <p className="text-sm text-stone-500">Review it below, tweak it if needed, then send it to the prospect.</p>
          )}

          {/* Live, embedded preview — exactly what the prospect sees at /p/{token}. */}
          {shareUrl ? (
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
              {generating ? (
                <div className="grid h-64 place-items-center text-sm text-stone-400">
                  <span className="flex items-center gap-2"><RefreshCw size={15} className="animate-spin" /> Generating…</span>
                </div>
              ) : (
                <iframe
                  key={preview.status}
                  src={shareUrl}
                  title="Website preview"
                  className="h-[520px] w-full bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              )}
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
            <Button size="sm" disabled={busy || generating} onClick={sendEmail}>
              <Mail size={14} /> Send to prospect
            </Button>
            <Button size="sm" variant="outline" disabled={busy || generating} onClick={markSent}>
              <Send size={14} /> {preview.sentAt ? "Mark sent again" : "Mark sent"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || generating} onClick={() => setShowChanges((v) => !v)}>
              <Pencil size={14} /> Request changes
            </Button>
            <Button size="sm" variant="outline" disabled={busy || generating} onClick={regenerate}>
              <RefreshCw size={14} /> Regenerate
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowHelp((v) => !v)}>
              <LifeBuoy size={14} /> Technical help
            </Button>
            {preview.sentAt ? <span className="text-xs text-stone-400">Sent {new Date(preview.sentAt).toLocaleDateString()}</span> : null}
          </div>

          {/* Request changes — free-text → AI regenerates (auto-shown, no admin review) */}
          {showChanges ? (
            <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
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
      )}
    </div>
  );
}
