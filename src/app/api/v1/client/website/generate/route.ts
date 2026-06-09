import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import {
  startGeneration,
  runGenerationJob,
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
    const { jobId } = await startGeneration(client.id, parsed.data);
    // Fire-and-forget: continues on the server even if the client navigates away.
    // (Production should hand this to a durable worker; see runGenerationJob.)
    void runGenerationJob(jobId).catch((e) => console.error("[generate] job failed", jobId, e));
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
