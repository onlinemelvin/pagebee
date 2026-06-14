import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { removeMember, assertOwner, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE — remove a team member (owner only; can't remove the owner or yourself). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { userId } = await params;
  try {
    await assertOwner(client.id, ctx.userId);
    await removeMember(client.id, ctx.userId, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[team/member/remove]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
