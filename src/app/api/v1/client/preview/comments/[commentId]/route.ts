import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import {
  updateComment,
  deleteComment,
  getCommentScope,
  updateCommentSchema,
  type CommentAuthor,
} from "@/lib/modules/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authorize: the comment must belong to the caller's tenant AND be the client's own pin. */
async function ownComment(commentId: string, clientId: string) {
  const scope = await getCommentScope(commentId);
  if (!scope || scope.authorType !== "CLIENT") return null;
  if (scope.version.website.clientId !== clientId) return null;
  return scope;
}

/** PATCH /api/v1/client/preview/comments/{commentId} — edit/withdraw the client's own pin. */
export async function PATCH(req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { commentId } = await params;
  if (!(await ownComment(commentId, client.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = updateCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const author: CommentAuthor = { type: "CLIENT", id: client.id, name: client.businessName };
  return NextResponse.json({ comment: await updateComment(commentId, author, parsed.data) });
}

/** DELETE /api/v1/client/preview/comments/{commentId}. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { commentId } = await params;
  if (!(await ownComment(commentId, client.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteComment(commentId);
  return NextResponse.json({ ok: true });
}
