import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { acceptInvite, acceptInviteSchema, TeamError } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — accept a team invitation. Uses the current session if signed in; otherwise
 *  creates an account from { name, password } for the invite's email. */
export async function POST(req: Request) {
  const parsed = acceptInviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });

  const ctx = await getAuthContext();
  try {
    const r = await acceptInvite(parsed.data.token, {
      userId: ctx?.userId,
      name: parsed.data.name,
      password: parsed.data.password,
    });
    return NextResponse.json({ ok: true, createdAccount: r.createdAccount, email: r.email });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[invite/accept]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
