import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import {
  updateComment,
  deleteComment,
  getCommentScope,
  updateCommentSchema,
  type CommentAuthor,
} from "@/lib/modules/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/websites/{versionId}/comments/{commentId} — resolve/reopen/edit. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id, commentId } = await params;
  const scope = await getCommentScope(commentId);
  if (!scope || scope.versionId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = updateCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const author: CommentAuthor = { type: ctx.isAdmin ? "ADMIN" : "REVIEWER", id: ctx.userId, name: ctx.email };
  return NextResponse.json({ comment: await updateComment(commentId, author, parsed.data) });
}

/** DELETE /api/v1/admin/websites/{versionId}/comments/{commentId}. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id, commentId } = await params;
  const scope = await getCommentScope(commentId);
  if (!scope || scope.versionId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteComment(commentId);
  return NextResponse.json({ ok: true });
}
