import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs"; // Prisma requires the Node runtime
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().max(120).optional(),
  business: z.string().trim().max(160).optional(),
  source: z.string().trim().max(200).optional(),
});

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/**
 * POST /api/v1/public/waitlist
 * Public, no auth — captures a pre-launch waitlist signup. Idempotent on email.
 */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "waitlist", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const { email, name, business, source } = parsed.data;
  const ip = clientIp(req);
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;

  // Idempotent: re-submitting the same email is a no-op success, never an error.
  await prisma.waitlistEntry.upsert({
    where: { email: email.toLowerCase() },
    update: { name, business },
    create: { email: email.toLowerCase(), name, business, source, ipHash },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
