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
  out_of_updates: "You're out of website updates this month.",
  no_live_site: "Your site isn't live yet.",
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
  mode = "preview",
}: {
  canComment: boolean;
  /** Edits left this cycle — pre-launch free revisions in "preview" mode, monthly updates in "live". */
  revisionsLeft: number;
  /** Current plan — drives the "out of edits" upsell to the next tier. */
  planName: string;
  /** A revision is already in our review queue — show the existing preview, locked, with a notice. */
  reviewing?: boolean;
  /** "preview" = reviewing an unlaunched/pending preview (approve + free revisions). "live" = annotate
   *  the published site to request a change, which consumes one monthly update (no approve step). */
  mode?: "preview" | "live";
}) {
  const router = useRouter();
  const isLive = mode === "live";
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [upsell, setUpsell] = React.useState(false);
  const [justSent, setJustSent] = React.useState(false); // changes submitted this session
  const [error, setError] = React.useState<string | null>(null);
  // Pins the client has placed, listed in the confirmation modal so they can review what's bundled.
  const [comments, setComments] = React.useState<
    Array<{ id: string; body: string; anchorText: string | null; pagePath: string }>
  >([]);
  const [loadingComments, setLoadingComments] = React.useState(false);

  async function openModal() {
    setError(null);
    setModalOpen(true);
    setLoadingComments(true);
    try {
      const res = await fetch("/api/v1/client/preview/comments");
      const data = (await res.json().catch(() => null)) as {
        comments?: Array<{ id: string; body: string; anchorText: string | null; pagePath: string; parentId: string | null; kind: string }>;
      } | null;
      // Top-level change-request pins only (skip replies/notes).
      setComments((data?.comments ?? []).filter((c) => !c.parentId && c.kind === "CHANGE_REQUEST"));
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }

  // Locked whenever changes are with our team — either submitted just now, or a revision was
  // already pending when the page loaded.
  const sent = justSent || reviewing;

  // Out of edits this cycle: don't invite markup, hide "Send my changes", upsell instead.
  const outOfEdits = !sent && revisionsLeft <= 0;
  const next = nextTier(planName);
  // Live mode is bounded by the monthly update quota → tell them the reset date.
  const now = new Date();
  const resetLabel = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

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
    // Live site → request a change against the monthly update quota (bundles all pins into 1 update).
    // Unlaunched/pending preview → a free revision.
    const path = isLive ? "/api/v1/client/website/update" : "/api/v1/client/preview/request-revision";
    const ok = await post(path, { note });
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
      const result = (await res.json().catch(() => ({}))) as {
        launched?: boolean;
        awaitingPayment?: boolean;
        awaitingUpgrade?: boolean;
        toPlan?: string;
      };

      // Real accounts: approval moves to the setup-fee step — send them to the dedicated launch page
      // (setup fee + first month summary → Stripe). The webhook launches the site once payment
      // succeeds. Mirrors ApproveLaunchButton so the preview footer doesn't dead-end.
      if (result.awaitingPayment) {
        router.push("/client/launch");
        return;
      }

      // This was a free preview of a HIGHER tier — publishing it requires upgrading first (setup-fee
      // delta + prorated monthly). Send them to billing with the upgrade pre-opened.
      if (result.awaitingUpgrade) {
        router.push(`/client/billing?upgrade=${result.toPlan ?? ""}`);
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
      ✓ Your {isLive ? "change request is" : "comments are"} received — our team is reviewing (~48h)
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
            ✦ Upgrade to {next.label} for more
          </button>
        )
      ) : (
        <button
          onClick={openModal}
          disabled={busy}
          className="rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-900 hover:bg-white disabled:opacity-50"
        >
          {isLive ? "Request changes" : "Send my changes"}
        </button>
      )}
      {/* A live site has no "approve" — changes go to the team as an update. */}
      {!isLive && (
        <button
          onClick={approve}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Approve & launch"}
        </button>
      )}
    </div>
  );

  // What the yellow footer says when comment mode is off. Out of edits → reflect that and point
  // to the upsell / reset instead of inviting markup.
  const bannerMessage = sent
    ? isLive
      ? "Your change request is with our team — they'll review and publish it to your live site shortly. You're viewing your live site in the meantime."
      : "Your review comments are received — our team is reviewing them (about a 48-hour turnaround). You're viewing your current preview in the meantime."
    : outOfEdits
      ? isLive
        ? next
          ? `You're out of website updates this month — they reset on ${resetLabel}, or upgrade to ${next.label} for more.`
          : `You're out of website updates this month — they reset on ${resetLabel}.`
        : next
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
            <h2 className="font-display text-xl text-stone-900">{isLive ? "Request changes" : "Send your changes"}</h2>
            <p className="mt-1 text-sm text-stone-600">
              {comments.length > 0
                ? "These pinned changes are included"
                : "Any changes you pin on the page are included"}
              . Add additional comments below if you&apos;d like (optional).
              {isLive ? " All of it counts as one monthly update." : ""}
            </p>

            {loadingComments ? (
              <p className="mt-3 text-sm text-stone-400">Loading your pins…</p>
            ) : comments.length > 0 ? (
              <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3">
                {comments.map((c, i) => (
                  <li key={c.id} className="text-sm text-stone-700">
                    <span className="mr-1.5 font-semibold text-stone-900">{i + 1}.</span>
                    {c.anchorText && <span className="text-stone-400">near “{c.anchorText}” — </span>}
                    {c.body}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-400">
                You haven&apos;t pinned any changes yet — add a comment below, or close this and pin them on the page.
              </p>
            )}

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
