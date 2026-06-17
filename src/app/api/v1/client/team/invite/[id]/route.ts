import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { revokeInvite, assertOwner, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE — revoke a pending invite (owner only). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    await assertOwner(client.id, ctx.userId);
    await revokeInvite(client.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[team/invite/revoke]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
