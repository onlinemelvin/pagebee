import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireReview, AuthError } from "@/lib/auth/session";
import { approveDomainRequest, approveDomainPurchase, rejectDomainRequest } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // approving a purchase registers the domain inline

const rejectSchema = z.object({ reason: z.string().max(500).optional() });

/**
 * POST /api/v1/admin/domains/{websiteId} — approve a domain in the queue. Branches on source: a
 * "connect" domain is added to the Vercel project (returns DNS records); a "purchase" (over-cap,
 * price_review) is bought via the registrar. Same reviewer permission as the website review queue.
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
  const primary = await prisma.websiteDomain.findFirst({
    where: { websiteId, isPrimary: true },
    select: { source: true },
  });

  if (primary?.source === "purchase") {
    const r = await approveDomainPurchase(websiteId, ctx.userId);
    if (!r.ok) return NextResponse.json({ error: "purchase_failed", message: r.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

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
