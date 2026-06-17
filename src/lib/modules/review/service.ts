import { prisma } from "@/lib/db";
import type { ReviewActorType, WebsiteReviewComment } from "@prisma/client";
import type { CreateCommentInput, UpdateCommentInput } from "./schema";

/** Who is leaving the comment. id/name are denormalized for display. */
export interface CommentAuthor {
  type: ReviewActorType;
  id: string | null;
  name: string | null;
}

/** JSON-safe shape returned to the UI (dates as ISO strings). */
export interface ReviewCommentDTO {
  id: string;
  versionId: string;
  parentId: string | null;
  authorType: ReviewActorType;
  authorId: string | null;
  authorName: string | null;
  kind: WebsiteReviewComment["kind"];
  status: WebsiteReviewComment["status"];
  pagePath: string;
  selector: string | null;
  anchorText: string | null;
  x: number | null;
  y: number | null;
  body: string;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDTO(c: WebsiteReviewComment): ReviewCommentDTO {
  return {
    id: c.id,
    versionId: c.versionId,
    parentId: c.parentId,
    authorType: c.authorType,
    authorId: c.authorId,
    authorName: c.authorName,
    kind: c.kind,
    status: c.status,
    pagePath: c.pagePath,
    selector: c.selector,
    anchorText: c.anchorText,
    x: c.x,
    y: c.y,
    body: c.body,
    resolvedById: c.resolvedById,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** All comments on a version, oldest first (parents and replies interleaved by time). */
export async function listComments(versionId: string): Promise<ReviewCommentDTO[]> {
  const rows = await prisma.websiteReviewComment.findMany({
    where: { versionId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDTO);
}

export async function addComment(
  versionId: string,
  author: CommentAuthor,
  input: CreateCommentInput,
): Promise<ReviewCommentDTO> {
  // Replies inherit kind NOTE (only top-level pins drive regeneration) and carry no anchor.
  const isReply = Boolean(input.parentId);
  const created = await prisma.websiteReviewComment.create({
    data: {
      versionId,
      parentId: input.parentId ?? null,
      authorType: author.type,
      authorId: author.id,
      authorName: author.name,
      kind: isReply ? "NOTE" : input.kind,
      pagePath: input.pagePath,
      selector: isReply ? null : input.selector ?? null,
      anchorText: isReply ? null : input.anchorText ?? null,
      x: isReply ? null : input.x ?? null,
      y: isReply ? null : input.y ?? null,
      body: input.body,
    },
  });
  return toDTO(created);
}

export async function updateComment(
  commentId: string,
  author: CommentAuthor,
  patch: UpdateCommentInput,
): Promise<ReviewCommentDTO> {
  const resolving = patch.status === "RESOLVED" || patch.status === "WONT_FIX";
  const reopening = patch.status === "OPEN";
  const updated = await prisma.websiteReviewComment.update({
    where: { id: commentId },
    data: {
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(resolving ? { resolvedById: author.id, resolvedAt: new Date() } : {}),
      ...(reopening ? { resolvedById: null, resolvedAt: null } : {}),
    },
  });
  return toDTO(updated);
}

export async function deleteComment(commentId: string): Promise<void> {
  await prisma.websiteReviewComment.delete({ where: { id: commentId } });
}

/** Resolve a single comment's owning version + tenant — used to authorize mutations. */
export async function getCommentScope(commentId: string) {
  return prisma.websiteReviewComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      versionId: true,
      authorType: true,
      version: { select: { website: { select: { clientId: true } } } },
    },
  });
}

export async function openChangeRequestCount(versionId: string): Promise<number> {
  return prisma.websiteReviewComment.count({
    where: { versionId, kind: "CHANGE_REQUEST", status: "OPEN" },
  });
}

/** Open change-request counts for many versions at once (queue badges). */
export async function openChangeRequestCounts(versionIds: string[]): Promise<Record<string, number>> {
  if (!versionIds.length) return {};
  const grouped = await prisma.websiteReviewComment.groupBy({
    by: ["versionId"],
    where: { versionId: { in: versionIds }, kind: "CHANGE_REQUEST", status: "OPEN" },
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.versionId, g._count._all]));
}

/**
 * Compile open change-request pins into a single structured instruction for the next
 * regeneration, and return the comment ids that were folded in (so the caller can mark
 * them resolved once the new version is queued). Empty `note` when there's nothing open.
 */
export interface CompiledEdit {
  pagePath: string;
  selector: string | null;
  anchorText: string | null;
  instruction: string;
}

export async function compileChangeRequest(
  versionId: string,
): Promise<{ note: string; commentIds: string[]; edits: CompiledEdit[] }> {
  const open = await prisma.websiteReviewComment.findMany({
    where: { versionId, kind: "CHANGE_REQUEST", status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, pagePath: true, selector: true, anchorText: true, body: true },
  });
  if (!open.length) return { note: "", commentIds: [], edits: [] };

  const lines = open.map((c, i) => {
    const where = c.anchorText ? `${c.pagePath} · near "${c.anchorText}"` : c.pagePath;
    return `${i + 1}. [${where}] ${c.body}`;
  });
  const note =
    "Apply these specific changes requested in review (keep everything else strong):\n" +
    lines.join("\n");
  // Structured anchors for surgical editing — only the pinned elements change.
  const edits: CompiledEdit[] = open.map((c) => ({
    pagePath: c.pagePath,
    selector: c.selector,
    anchorText: c.anchorText,
    instruction: c.body,
  }));
  return { note, commentIds: open.map((c) => c.id), edits };
}

/** Mark a set of comments resolved (after their changes were sent to regeneration). */
export async function markResolved(commentIds: string[], resolvedById: string | null): Promise<void> {
  if (!commentIds.length) return;
  await prisma.websiteReviewComment.updateMany({
    where: { id: { in: commentIds } },
    data: { status: "RESOLVED", resolvedById, resolvedAt: new Date() },
  });
}
