import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { decideByToken } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/public/finance/{token}/decision — customer accepts or declines an estimate/quote. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "finance-decision", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { decision?: string } | null;
  const decision = body?.decision === "ACCEPTED" ? "ACCEPTED" : body?.decision === "DECLINED" ? "DECLINED" : null;
  if (!decision) return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  const ok = await decideByToken(token, decision);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
