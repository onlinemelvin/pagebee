import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClient, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({ name: z.string().trim().min(1, "Enter your name").max(120) });

/** PATCH — update the signed-in user's own profile (display name). Any client user (owner or staff). */
export async function PATCH(req: Request) {
  let ctx;
  try {
    ({ ctx } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });

  await prisma.user.update({ where: { id: ctx.userId }, data: { name: parsed.data.name } });
  return NextResponse.json({ ok: true, name: parsed.data.name });
}
