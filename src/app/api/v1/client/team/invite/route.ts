import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { inviteMember, checkInviteEmail, assertOwner, inviteInputSchema, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkEmailSchema = z.string().trim().email().max(200);

/** GET ?email= — pre-flight check for the invite form: is the email free, already on a team, or
 *  already invited? Owner-only, mirrors the POST guards so step 1 can warn before access is chosen. */
export async function GET(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = checkEmailSchema.safeParse(new URL(req.url).searchParams.get("email") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    await assertOwner(client.id, ctx.userId);
    return NextResponse.json(await checkInviteEmail(client.id, parsed.data));
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[team/invite:check]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

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
