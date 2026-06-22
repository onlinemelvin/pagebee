"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnnotatablePreview } from "@/components/review/AnnotatablePreview";
import { UpgradeModal } from "./UpgradeModal";
import { nextTier } from "@/lib/plans";

const ERR: Record<string, string> = {
  no_content: "Pin a change on the page or add a comment before sending.",
  no_revisions_left: "You've used your free revision.",
  already_live: "This site is already live.",
};

/**
 * Full-screen preview review for the signed-in client (the /preview page). The preview fills
 * the viewport; the single sticky footer carries everything — back to dashboard, the comment
 * toggle, and the two primary actions side by side: "Send my changes" (opens a modal for
 * additional comments, then bundles the pinned changes) and "Approve & launch". Once changes
 * are sent the site goes back to our team, so every action locks until it's re-released.
 */
export function ClientPreviewReview({
  canComment,
  revisionsLeft,
  planName,
  reviewing = false,
}: {
  canComment: boolean;
  revisionsLeft: number;
  /** Current plan — drives the "out of edits" upsell to the next tier. */
  planName: string;
  /** A revision is already in our review queue — show the existing preview, locked, with a notice. */
  reviewing?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [upsell, setUpsell] = React.useState(false);
  const [justSent, setJustSent] = React.useState(false); // changes submitted this session
  const [error, setError] = React.useState<string | null>(null);

  // Locked whenever changes are with our team — either submitted just now, or a revision was
  // already pending when the page loaded.
  const sent = justSent || reviewing;

  // No website edits left this cycle: don't invite markup, hide "Send my changes", upsell instead.
  const outOfEdits = !sent && revisionsLeft <= 0;
  const next = nextTier(planName);

  async function post(path: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error((b?.error && ERR[b.error]) || b?.error || "Something went wrong");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendChanges(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    const ok = await post("/api/v1/client/preview/request-revision", { note });
    if (ok) {
      setModalOpen(false);
      setJustSent(true); // lock the footer until our team re-releases an updated preview
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/preview/approve", { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error((b?.error && ERR[b.error]) || b?.error || "Something went wrong");
      }
      const result = (await res.json().catch(() => ({}))) as { launched?: boolean; awaitingPayment?: boolean };

      // Real accounts: approval moves to the setup-fee step — send them to the dedicated launch page
      // (setup fee + first month summary → Stripe). The webhook launches the site once payment
      // succeeds. Mirrors ApproveLaunchButton so the preview footer doesn't dead-end.
      if (result.awaitingPayment) {
        router.push("/client/launch");
        return;
      }

      // Test accounts / setup fee disabled: launched immediately.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const footerStart = (
    <Link
      href="/client"
      className="inline-flex items-center rounded-md bg-stone-900/85 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-stone-900"
    >
      ← Dashboard
    </Link>
  );

  const footerEnd = sent ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-amber-300">
      ✓ Your comments are received — our team is reviewing (~48h)
    </span>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-[11px] font-semibold text-red-800">{error}</span>}
      {outOfEdits ? (
        next && (
          <button
            onClick={() => setUpsell(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-stone-700"
          >
            ✦ Upgrade to {next.label} for more edits
          </button>
        )
      ) : (
        <button
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          disabled={busy}
          className="rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-900 hover:bg-white disabled:opacity-50"
        >
          Send my changes
        </button>
      )}
      <button
        onClick={approve}
        disabled={busy}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? "Working…" : "Approve & launch"}
      </button>
    </div>
  );

  // What the yellow footer says when comment mode is off. Out of edits → reflect that and point
  // to the upsell / reset instead of inviting markup.
  const bannerMessage = sent
    ? "Your review comments are received — our team is reviewing them (about a 48-hour turnaround). You're viewing your current preview in the meantime."
    : outOfEdits
      ? next
        ? `This site isn't live yet. You've used all your website edits — upgrade to ${next.label} for more, or wait for your monthly reset. Approve & launch whenever you're ready.`
        : "This site isn't live yet. You've used all your website edits this cycle — they reset next month. Approve & launch whenever you're ready."
      : undefined;

  return (
    <div className="flex h-screen flex-col">
      <AnnotatablePreview
        frameSrc="/preview/frame?annotate=1"
        apiBase="/api/v1/client/preview"
        initialComments={[]}
        canComment={canComment && !outOfEdits}
        canResolve={false}
        deletePolicy="own"
        bordered={false}
        locked={sent}
        bannerMessage={bannerMessage}
        className="h-full"
        footerStart={footerStart}
        footerEnd={footerEnd}
      />

      {next && (
        <UpgradeModal open={upsell} onClose={() => setUpsell(false)} toPlan={next.name} reason="preview_out_of_edits" />
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => !busy && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl text-stone-900">Send your changes</h2>
            <p className="mt-1 text-sm text-stone-600">
              Any changes you pinned on the page are included. Add additional comments below if
              you&apos;d like (optional).
            </p>
            <form onSubmit={sendChanges} className="mt-4">
              <Textarea name="note" rows={4} placeholder="Additional comments (optional)…" autoFocus />
              {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setModalOpen(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
