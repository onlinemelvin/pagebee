import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimited } from "@/lib/ratelimit";
import { requestPasswordReset } from "@/lib/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().email().max(200) });

/** POST /api/v1/public/forgot-password — send a branded password-reset link.
 *  Always returns 200 (no account enumeration). */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "forgot-password", { limit: 5, windowMs: 600_000 });
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    await requestPasswordReset(parsed.data.email);
  } catch (err) {
    console.error("[POST /api/v1/public/forgot-password]", err);
    // Still return ok — never reveal whether the address exists or failed.
  }
  return NextResponse.json({ ok: true });
}
