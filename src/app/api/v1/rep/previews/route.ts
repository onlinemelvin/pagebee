import { NextResponse, after } from "next/server";
import { ZodError } from "zod";
import { requireContractedRep, AuthError } from "@/lib/auth/session";
import { requestPreview, SalesError } from "@/lib/modules/sales";
import { claimAndRun, prepareGeneration } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/v1/rep/previews — rep requests a free AI website preview for a prospect.
 * Creates the provisional client + enqueues generation, then runs it (inline locally, offloaded on
 * Vercel — mirrors /api/v1/client/website/generate). Returns the share token immediately.
 */
export async function POST(req: Request) {
  try {
    const { ctx, employee } = await requireContractedRep();
    const body = await req.json().catch(() => null);
    const result = await requestPreview(employee.id, body, { userId: ctx.userId });

    if (process.env.VERCEL) {
      after(() => prepareGeneration(result.jobId).catch((e) => console.error("[rep/preview] prepare failed", e)));
    } else {
      void claimAndRun(result.jobId).catch((e) => console.error("[rep/preview] inline job failed", e));
    }

    return NextResponse.json(
      { previewId: result.previewId, publicToken: result.publicToken },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
