import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReview, AuthError } from "@/lib/auth/session";
import { approveDomainRequest, rejectDomainRequest } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rejectSchema = z.object({ reason: z.string().max(500).optional() });

/**
 * POST /api/v1/admin/domains/{websiteId} — approve a requested custom domain. Adds it to the
 * Vercel project and returns the DNS records the owner must set. Same reviewer permission as the
 * website review queue (website:review).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ websiteId: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { websiteId } = await params;
  const result = await approveDomainRequest(websiteId, ctx.userId);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "vercel_rejected" ? 502 : 409;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }
  return NextResponse.json({ ok: true, domain: result.state });
}

/** DELETE /api/v1/admin/domains/{websiteId} — reject a requested custom domain. */
export async function DELETE(req: Request, { params }: { params: Promise<{ websiteId: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { websiteId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = rejectSchema.safeParse(body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;
  const result = await rejectDomainRequest(websiteId, ctx.userId, reason);
  if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
