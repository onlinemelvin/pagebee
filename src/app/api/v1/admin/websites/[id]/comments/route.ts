import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { listComments, addComment, createCommentSchema, type CommentAuthor } from "@/lib/modules/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/websites/{versionId}/comments — all review comments on a version. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  return NextResponse.json({ comments: await listComments(id) });
}

/** POST /api/v1/admin/websites/{versionId}/comments — add a pin/reply as a reviewer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const parsed = createCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const author: CommentAuthor = {
    type: ctx.isAdmin ? "ADMIN" : "REVIEWER",
    id: ctx.userId,
    name: ctx.email,
  };
  const comment = await addComment(id, author, parsed.data);
  return NextResponse.json({ comment }, { status: 201 });
}
