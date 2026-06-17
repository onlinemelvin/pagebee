import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { retryGenerationJob } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/website-jobs/{jobId}/retry — requeue & re-run a failed generation job. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  let ctx;
  try {
    ctx = await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { jobId } = await params;
  try {
    await retryGenerationJob(jobId, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/admin/website-jobs/[jobId]/retry]", err);
    const message = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: message }, { status: message === "job_not_found" ? 404 : 500 });
  }
}
