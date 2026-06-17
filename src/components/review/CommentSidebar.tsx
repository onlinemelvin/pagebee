"use client";

import * as React from "react";
import { Check, CornerDownRight, MapPin, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewCommentDTO } from "@/lib/modules/review";

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-green-100 text-green-800",
  WONT_FIX: "bg-stone-200 text-stone-600",
};
const AUTHOR_DOT: Record<string, string> = {
  ADMIN: "bg-violet-500",
  REVIEWER: "bg-blue-500",
  CLIENT: "bg-amber-500",
  SYSTEM: "bg-stone-400",
};

export interface CommentSidebarProps {
  comments: ReviewCommentDTO[];
  activeId: string | null;
  canResolve: boolean;
  canDelete: (c: ReviewCommentDTO) => boolean;
  canReply: boolean;
  busyId: string | null;
  onJump: (c: ReviewCommentDTO) => void;
  onSetStatus: (c: ReviewCommentDTO, status: "OPEN" | "RESOLVED" | "WONT_FIX") => void;
  onDelete: (c: ReviewCommentDTO) => void;
  onReply: (parentId: string, body: string) => void;
}

export function CommentSidebar(props: CommentSidebarProps) {
  const { comments } = props;
  const tops = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  // Open pins first, then resolved/won't-fix; stable by creation order within each.
  const ordered = [...tops].sort((a, b) => (a.status === "OPEN" ? 0 : 1) - (b.status === "OPEN" ? 0 : 1));

  if (!tops.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-stone-400">
        No comments yet. Click <span className="font-medium text-stone-600">Add comment</span>, then click the
        part of the page you want to change.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-stone-100">
      {ordered.map((c) => (
        <CommentItem
          key={c.id}
          index={tops.indexOf(c) + 1}
          comment={c}
          replies={repliesOf(c.id)}
          {...props}
        />
      ))}
    </ol>
  );
}

function CommentItem({
  comment: c,
  index,
  replies,
  activeId,
  canResolve,
  canDelete,
  canReply,
  busyId,
  onJump,
  onSetStatus,
  onDelete,
  onReply,
}: { comment: ReviewCommentDTO; index: number; replies: ReviewCommentDTO[] } & Omit<CommentSidebarProps, "comments">) {
  const [replyOpen, setReplyOpen] = React.useState(false);
  const active = activeId === c.id;
  const busy = busyId === c.id;

  return (
    <li className={cn("px-4 py-3 text-sm", active && "bg-amber-50/60")}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onJump(c)}
          title="Jump to this spot"
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-white hover:bg-amber-600"
        >
          {index}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", AUTHOR_DOT[c.authorType] ?? "bg-stone-400")} />
            <span className="truncate font-medium text-stone-700">{c.authorName ?? c.authorType}</span>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase", STATUS_CHIP[c.status])}>
              {c.status === "WONT_FIX" ? "won't fix" : c.status.toLowerCase()}
            </span>
            {c.kind === "NOTE" && <span className="text-[10px] text-stone-400">note</span>}
          </div>
          <button onClick={() => onJump(c)} className="mt-1 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <MapPin size={11} /> {c.pagePath}
            {c.anchorText ? <span className="truncate italic">· “{c.anchorText}”</span> : null}
          </button>
          <p className="mt-1 whitespace-pre-wrap text-stone-800">{c.body}</p>

          {replies.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-l-2 border-stone-100 pl-3">
              {replies.map((r) => (
                <li key={r.id} className="text-xs">
                  <span className="font-medium text-stone-600">{r.authorName ?? r.authorType}:</span>{" "}
                  <span className="whitespace-pre-wrap text-stone-700">{r.body}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {canResolve && c.status === "OPEN" && (
              <button disabled={busy} onClick={() => onSetStatus(c, "RESOLVED")} className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline disabled:opacity-50">
                <Check size={12} /> Resolve
              </button>
            )}
            {canResolve && c.status !== "OPEN" && (
              <button disabled={busy} onClick={() => onSetStatus(c, "OPEN")} className="inline-flex items-center gap-1 font-medium text-stone-500 hover:underline disabled:opacity-50">
                <Undo2 size={12} /> Reopen
              </button>
            )}
            {canResolve && c.status === "OPEN" && (
              <button disabled={busy} onClick={() => onSetStatus(c, "WONT_FIX")} className="font-medium text-stone-500 hover:underline disabled:opacity-50">
                Won&apos;t fix
              </button>
            )}
            {canReply && (
              <button onClick={() => setReplyOpen((v) => !v)} className="inline-flex items-center gap-1 font-medium text-stone-500 hover:underline">
                <CornerDownRight size={12} /> Reply
              </button>
            )}
            {canDelete(c) && (
              <button disabled={busy} onClick={() => onDelete(c)} className="inline-flex items-center gap-1 font-medium text-red-600 hover:underline disabled:opacity-50">
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>

          {replyOpen && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
                if (body) onReply(c.id, body);
                setReplyOpen(false);
                e.currentTarget.reset();
              }}
            >
              <input name="body" required placeholder="Reply…" autoFocus className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs" />
              <button type="submit" className="rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white">Send</button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
