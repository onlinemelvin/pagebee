"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewCommentDTO } from "@/lib/modules/review";
import { usePreviewBridge, type BridgePin, type PickPayload, type RectsPayload } from "./usePreviewBridge";
import { CommentSidebar } from "./CommentSidebar";

type Rect = { x: number; y: number; w: number; h: number };

export interface AnnotatablePreviewProps {
  /** Iframe source — the serveReviewFrame route (admin frame or /preview/frame?annotate=1). */
  frameSrc: string;
  /** REST base for comments: `${apiBase}/comments` (+ `/[id]`). */
  apiBase: string;
  initialComments: ReviewCommentDTO[];
  /** Whether the viewer is allowed to comment at all (gates the toggle). */
  canComment: boolean;
  canResolve: boolean;
  /** Who may delete: "all" (reviewers), "own" (clients delete their own pins), "none". */
  deletePolicy: "all" | "own" | "none";
  /** When set, shows a "Request these changes" button that POSTs here (no body) then refreshes. */
  requestChangesUrl?: string;
  requestChangesLabel?: string;
  onRequested?: () => void;
  /** Bottom bar badge, e.g. "🐝 FREE PREVIEW" (client) or "REVIEW" (admin). */
  bannerBadge?: string;
  /** Bottom bar message shown when comment mode is off. */
  bannerMessage?: string;
  /** Start with comment mode armed (admins review with pins on; clients view first). */
  defaultCommenting?: boolean;
  /** Optional node rendered at the far start (left) of the footer bar. */
  footerStart?: React.ReactNode;
  /** Optional node rendered at the end (right) of the footer's action cluster. */
  footerEnd?: React.ReactNode;
  /** Wrap in a rounded border box (default). Set false for a full-bleed / full-screen surface. */
  bordered?: boolean;
  /** Read-only: disable commenting interactions (e.g. after the client has sent changes). */
  locked?: boolean;
  className?: string;
}

export function AnnotatablePreview({
  frameSrc,
  apiBase,
  initialComments,
  canComment,
  canResolve,
  deletePolicy,
  requestChangesUrl,
  requestChangesLabel = "Request these changes",
  onRequested,
  bannerBadge = "🐝 FREE PREVIEW",
  bannerMessage = "This site isn't live yet — turn on comment mode to mark up changes.",
  defaultCommenting = false,
  footerStart,
  footerEnd,
  bordered = true,
  locked = false,
  className,
}: AnnotatablePreviewProps) {
  const router = useRouter();
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [comments, setComments] = React.useState<ReviewCommentDTO[]>(initialComments);
  const [page, setPage] = React.useState("/");
  const [rects, setRects] = React.useState<Record<string, Rect>>({});
  const [commenting, setCommenting] = React.useState(canComment && defaultCommenting);
  const [picking, setPicking] = React.useState(false);
  const [readyN, setReadyN] = React.useState(0); // bumps on each (re)load so we re-sync the bridge
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ anchor: PickPayload["anchor"]; left: number; top: number } | null>(null);

  const tops = comments.filter((c) => !c.parentId);
  const wantPins = React.useMemo<BridgePin[]>(
    () => tops.map((c) => ({ id: c.id, selector: c.selector, pagePath: c.pagePath, x: c.x, y: c.y })),
    [tops],
  );

  const onPick = React.useCallback((p: PickPayload) => {
    setPicking(false);
    const left = p.rect.x + (p.anchor.x ?? 0.5) * p.rect.w;
    const top = p.rect.y + (p.anchor.y ?? 0.5) * p.rect.h;
    setDraft({ anchor: p.anchor, left, top });
  }, []);

  const bridge = usePreviewBridge(iframeRef, {
    onReady: (p) => {
      setPage(p);
      setReadyN((n) => n + 1);
    },
    onNavigate: (p) => setPage(p),
    onPick,
    onRects: (r: RectsPayload) => {
      if (r.pagePath === page) setRects(r.rects);
    },
  });

  // Comment mode is the master switch: only when it's on do we arm right-click,
  // show pins, and allow new comments. `live` folds in the capability gate.
  const live = canComment && commenting && !locked;

  // Keep the iframe's pin set, pick mode, and right-click capability in sync.
  // `readyN` re-fires these after the iframe (re)loads so the bridge gets them post-init.
  React.useEffect(() => bridge.setWant(live ? wantPins : []), [bridge, live, wantPins, page, readyN]);
  React.useEffect(() => bridge.setPickMode(picking), [bridge, picking]);
  React.useEffect(() => bridge.setRightClick(live), [bridge, live, readyN]);

  function toggleCommenting() {
    setCommenting((on) => {
      const next = !on;
      if (!next) {
        setPicking(false);
        setDraft(null);
      }
      return next;
    });
  }

  // Refresh from the server on mount so prior pins show even when opened fresh (e.g. client modal).
  React.useEffect(() => {
    let alive = true;
    fetch(`${apiBase}/comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.comments) setComments(d.comments as ReviewCommentDTO[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [apiBase]);

  async function api(path: string, init: RequestInit) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(b?.error ?? `failed_${res.status}`);
    }
    return res.json();
  }

  async function createComment(anchor: PickPayload["anchor"], body: string) {
    setBusy(true);
    setError(null);
    try {
      const { comment } = (await api(`${apiBase}/comments`, {
        method: "POST",
        body: JSON.stringify({ ...anchor, body, kind: "CHANGE_REQUEST" }),
      })) as { comment: ReviewCommentDTO };
      setComments((cs) => [...cs, comment]);
      setActiveId(comment.id);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(c: ReviewCommentDTO, status: "OPEN" | "RESOLVED" | "WONT_FIX") {
    setBusyId(c.id);
    try {
      const { comment } = (await api(`${apiBase}/comments/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })) as { comment: ReviewCommentDTO };
      setComments((cs) => cs.map((x) => (x.id === c.id ? comment : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: ReviewCommentDTO) {
    setBusyId(c.id);
    try {
      await api(`${apiBase}/comments/${c.id}`, { method: "DELETE" });
      setComments((cs) => cs.filter((x) => x.id !== c.id && x.parentId !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reply(parentId: string, body: string) {
    const parent = comments.find((c) => c.id === parentId);
    try {
      const { comment } = (await api(`${apiBase}/comments`, {
        method: "POST",
        body: JSON.stringify({ parentId, body, pagePath: parent?.pagePath ?? "/" }),
      })) as { comment: ReviewCommentDTO };
      setComments((cs) => [...cs, comment]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  function jump(c: ReviewCommentDTO) {
    setActiveId(c.id);
    if (c.pagePath !== page) bridge.goto(c.pagePath);
    if (c.selector) window.setTimeout(() => bridge.highlight(c.selector), c.pagePath !== page ? 350 : 0);
  }

  async function requestChanges() {
    if (!requestChangesUrl) return;
    setBusy(true);
    setError(null);
    try {
      await api(requestChangesUrl, { method: "POST", body: JSON.stringify({}) });
      onRequested?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const canDelete = React.useCallback(
    (c: ReviewCommentDTO) =>
      deletePolicy === "all" ? true : deletePolicy === "own" ? c.authorType === "CLIENT" : false,
    [deletePolicy],
  );
  const openChangeReqs = tops.filter((c) => c.kind === "CHANGE_REQUEST" && c.status === "OPEN");
  const pinsOnPage = tops.filter((c) => c.pagePath === page && rects[c.id] && c.status === "OPEN");

  return (
    <div className={cn("flex flex-col overflow-hidden bg-white", bordered && "rounded-2xl border border-stone-200", className)}>
      {/* Preview + (when commenting) the comment list */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[60vh] flex-1 bg-stone-100">
          <iframe
            ref={iframeRef}
            src={frameSrc}
            title="Website preview"
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
          {/* Pin overlay — aligned to the iframe viewport (bridge rects are iframe-local).
              Only mounted in comment mode so the preview reads clean when it's off. */}
          {live && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {pinsOnPage.map((c) => {
                const r = rects[c.id];
                const left = r.x + (c.x ?? 0.5) * r.w;
                const top = r.y + (c.y ?? 0.5) * r.h;
                const n = tops.indexOf(c) + 1;
                return (
                  <button
                    key={c.id}
                    onClick={() => jump(c)}
                    style={{ left, top }}
                    className={cn(
                      "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white shadow ring-2 ring-white",
                      activeId === c.id ? "bg-amber-600 scale-110" : "bg-amber-500 hover:bg-amber-600",
                    )}
                  >
                    {n}
                  </button>
                );
              })}

              {draft && (
                <div
                  style={{ left: Math.min(draft.left, 9999), top: draft.top }}
                  className="pointer-events-auto absolute z-10 w-64 max-w-[80vw] -translate-x-1/2 translate-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-xl"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-stone-400">
                      {draft.anchor.pagePath}
                      {draft.anchor.anchorText ? ` · “${draft.anchor.anchorText.slice(0, 28)}”` : ""}
                    </span>
                    <button onClick={() => setDraft(null)} className="text-stone-400 hover:text-stone-600"><X size={14} /></button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
                      if (body) void createComment(draft.anchor, body);
                    }}
                  >
                    <textarea
                      name="body"
                      required
                      autoFocus
                      rows={3}
                      placeholder="What should change here?"
                      className="w-full resize-none rounded-lg border border-stone-300 px-2.5 py-2 text-sm"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-100">Cancel</button>
                      <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                        <Send size={12} /> Comment
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comment list — only while marking up */}
        {live && (
          <aside className="shrink-0 border-t border-stone-200 lg:w-80 lg:border-l lg:border-t-0">
            <div className="max-h-[40vh] overflow-y-auto lg:max-h-none">
              <CommentSidebar
                comments={comments}
                activeId={activeId}
                canResolve={canResolve}
                canDelete={canDelete}
                canReply={canComment}
                busyId={busyId}
                onJump={jump}
                onSetStatus={setStatus}
                onDelete={remove}
                onReply={reply}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Bottom bar — the yellow preview banner doubles as the comment-mode switch. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t-[3px] border-amber-700 bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2.5 text-stone-900">
        {footerStart}
        <span className="inline-flex items-center gap-2">
          <span className="rounded-md bg-stone-900 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-300">
            {bannerBadge}
          </span>
          <span className="text-sm font-medium">
            {live ? "Right-click the page to pin a change — or use “Add comment”." : bannerMessage}
          </span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {error && <span className="text-xs font-semibold text-red-800">{error}</span>}
          {tops.length > 0 && (
            <span className="text-xs font-semibold text-amber-900">
              {tops.length} comment{tops.length === 1 ? "" : "s"}
            </span>
          )}

          {live && (
            <button
              onClick={() => setPicking((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
                picking ? "bg-white text-amber-700 ring-2 ring-stone-900" : "bg-stone-900 text-white hover:bg-stone-700",
              )}
            >
              <MessageSquarePlus size={14} /> {picking ? "Click the page…" : "Add comment"}
            </button>
          )}

          {live && requestChangesUrl && (
            <button
              onClick={requestChanges}
              disabled={busy || openChangeReqs.length === 0}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-40"
              title={openChangeReqs.length === 0 ? "No open change requests" : undefined}
            >
              {busy ? "Sending…" : `${requestChangesLabel} (${openChangeReqs.length})`}
            </button>
          )}

          {canComment && (
            <button
              onClick={toggleCommenting}
              aria-pressed={commenting}
              disabled={locked}
              className={cn(
                "inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                commenting ? "bg-stone-900 text-white" : "bg-white/80 text-stone-900 hover:bg-white",
              )}
            >
              <MessageSquare size={14} /> Comment mode
              <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", commenting ? "bg-amber-400" : "bg-stone-300")}>
                <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", commenting ? "translate-x-4" : "translate-x-0.5")} />
              </span>
            </button>
          )}

          {footerEnd}
        </div>
      </div>
    </div>
  );
}
