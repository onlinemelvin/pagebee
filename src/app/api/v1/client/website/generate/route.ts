import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import {
  startGeneration,
  claimAndRun,
  gateRegenQuota,
  getLatestJobStatus,
  websiteIntakeSchema,
} from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/website/generate — enqueue a background generation.
 * Returns 202 immediately; the heavy work runs server-side and survives the
 * browser closing. The client polls GET for status.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = websiteIntakeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Regenerating a LIVE site consumes a monthly update (first build / pre-launch are free).
    const gate = await gateRegenQuota(client.id);
    if (!gate.ok) return NextResponse.json(gate, { status: 409 });

    const { jobId } = await startGeneration(client.id, parsed.data);
    // Dev / single-node: process in-process (atomic claim). In production set
    // GENERATION_WORKER=external (or on Vercel) so the durable worker handles it instead.
    const useWorker = process.env.GENERATION_WORKER === "external" || Boolean(process.env.VERCEL);
    if (!useWorker) {
      void claimAndRun(jobId).catch((e) => console.error("[generate] inline job failed", jobId, e));
    }
    return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
  } catch (err) {
    console.error("[POST /api/v1/client/website/generate]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}

/** GET /api/v1/client/website/generate — latest generation job status (for polling). */
export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const job = await getLatestJobStatus(client.id);
  return NextResponse.json({ job });
}
