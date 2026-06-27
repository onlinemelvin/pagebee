"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wand2, Copy, Check, ExternalLink, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/toast";

export interface PreviewView {
  id: string;
  status: string;
  publicToken: string | null;
  selectedPlan: string;
  sentAt: string | null;
}

const ERROR_COPY: Record<string, string> = {
  preview_exists: "This prospect already has a preview.",
  contract_required: "Your agreement must be active to create previews.",
  validation_error: "Add a short description and at least one service.",
  prospect_not_found: "This prospect isn't yours.",
};

export function PreviewPanel({
  prospectId,
  preview,
  canRequest,
  appUrl,
}: {
  prospectId: string;
  preview: PreviewView | null;
  canRequest: boolean;
  appUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [form, setForm] = React.useState({ about: "", services: "", plan: "HONEY" });

  const shareUrl = preview?.publicToken ? `${appUrl}/p/${preview.publicToken}` : null;
  const generating = preview?.status === "PREVIEW_GENERATING";

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/rep/previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          selectedPlan: form.plan,
          intake: {
            about: form.about,
            services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
          },
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(ERROR_COPY[d.error ?? ""] ?? "Could not start the preview.");
        return;
      }
      toast.success("Building the preview — it'll be ready in under a minute 🐝");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
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
              </p>
              <Button onClick={() => setOpen(true)}>
                <Wand2 size={15} /> Offer a free preview
              </Button>
            </div>
          ) : (
            <form onSubmit={request} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">What does the business do? *</span>
                <Textarea
                  required
                  value={form.about}
                  onChange={(e) => setForm({ ...form, about: e.target.value })}
                  placeholder="Family-owned pizzeria in Brooklyn, known for wood-fired pies and fast delivery."
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Services (comma-separated) *</span>
                <Input
                  required
                  value={form.services}
                  onChange={(e) => setForm({ ...form, services: e.target.value })}
                  placeholder="Dine-in, Delivery, Catering"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Showcase plan</span>
                <select
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="NECTAR">Nectar</option>
                  <option value="HONEY">Honey</option>
                  <option value="HIVE">Hive</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !form.about.trim() || !form.services.trim()}>
                  {busy ? "Starting…" : "Generate preview"}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shareUrl ? (
            <>
              {generating ? (
                <p className="text-sm text-amber-700">🐝 Still building — the link shows a loading page until it&apos;s ready (under a minute). Refresh to update the status.</p>
              ) : (
                <p className="text-sm text-stone-500">Share this link with the prospect — no account needed to view it.</p>
              )}
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
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy} onClick={markSent}>
                  <Send size={14} /> {preview.sentAt ? "Mark sent again" : "Mark as sent"}
                </Button>
                {preview.sentAt ? <span className="text-xs text-stone-400">Sent {new Date(preview.sentAt).toLocaleDateString()}</span> : null}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
