import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getClientReviewContext } from "@/lib/modules/preview";
import { listComments, addComment, createCommentSchema, type CommentAuthor } from "@/lib/modules/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/preview/comments — the client's OWN pins on their preview version. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { versionId } = await getClientReviewContext(client.id);
  if (!versionId) return NextResponse.json({ comments: [] });
  // Clients only ever see their own markup — internal reviewer notes never leak to the tenant.
  const mine = (await listComments(versionId)).filter((c) => c.authorType === "CLIENT");
  return NextResponse.json({ comments: mine });
}

/** POST /api/v1/client/preview/comments — add a pin while they still have a revision left. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { canComment, versionId } = await getClientReviewContext(client.id);
  if (!canComment || !versionId) return NextResponse.json({ error: "not_reviewable" }, { status: 403 });

  const parsed = createCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const author: CommentAuthor = { type: "CLIENT", id: client.id, name: client.businessName };
  const comment = await addComment(versionId, author, parsed.data);
  return NextResponse.json({ comment }, { status: 201 });
}
