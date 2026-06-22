import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { addComment, SupportError } from "@/lib/modules/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/support/tickets/{id}/comments — add a client reply. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const comment = await addComment(auth.client.id, id, auth.ctx.userId, body);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof SupportError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
