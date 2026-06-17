import { NextResponse, type NextRequest } from "next/server";
import { pollDomainVerification } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/cron/domains/verify — sweep "verifying" custom domains and flip the ones whose DNS
 * has propagated to "active" (Vercel-verified, SSL issued). Scheduled from vercel.json.
 *
 * Auth: Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set; we
 * also accept INTERNAL_API_SECRET so it can be triggered from internal tooling. Fail-closed —
 * if neither secret is configured the endpoint refuses to run (never publicly pollable).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await pollDomainVerification();
  return NextResponse.json({ ok: true, ...result });
}
