import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimited } from "@/lib/ratelimit";
import { resetPassword, AuthFlowError } from "@/lib/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200),
});

/** POST /api/v1/public/reset-password — consume a reset token + set a new password. */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "reset-password", { limit: 10, windowMs: 600_000 });
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    await resetPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFlowError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/public/reset-password]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
