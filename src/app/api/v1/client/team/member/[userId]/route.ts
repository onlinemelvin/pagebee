import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { removeMember, updateMemberPermissions, setMemberDisabled, assertOwner, updatePermissionsSchema, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — update a staff member (owner only). Body is either { disabled: boolean } to toggle their
 *  account access, or { permissions: string[] } to replace their capability set. */
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { userId } = await params;
  const body = (await req.json().catch(() => ({}))) as { disabled?: unknown; permissions?: unknown };
  try {
    await assertOwner(client.id, ctx.userId);
    // Enable/disable the member's account.
    if (typeof body.disabled === "boolean") {
      const r = await setMemberDisabled(client.id, ctx.userId, userId, body.disabled);
      return NextResponse.json({ ok: true, disabled: r.disabled });
    }
    // Otherwise, a permissions update.
    const parsed = updatePermissionsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
    const r = await updateMemberPermissions(client.id, userId, parsed.data.permissions);
    return NextResponse.json({ ok: true, permissions: r.permissions });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[team/member/patch]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

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
