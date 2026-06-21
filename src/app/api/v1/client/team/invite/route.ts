import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { inviteMember, assertOwner, inviteInputSchema, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — invite a teammate by email (owner only; enforces the plan seat limit). */
export async function POST(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = inviteInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });

  try {
    await assertOwner(client.id, ctx.userId);
    const invite = await inviteMember(client.id, ctx.userId, parsed.data.email, parsed.data.role, parsed.data.permissions ?? []);
    return NextResponse.json({ ok: true, id: invite.id });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[team/invite]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
