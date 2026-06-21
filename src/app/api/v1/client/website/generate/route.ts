import { NextResponse, after } from "next/server";
import { requireCapability, requireOwner, AuthError } from "@/lib/auth/session";
import { isTestMode } from "@/lib/modules/client";
import {
  startGeneration,
  claimAndRun,
  prepareGeneration,
  gateRegenQuota,
  getLatestJobStatus,
  websiteIntakeSchema,
} from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// On Vercel the `after()` callback runs prepare (config call + image prep + prompt build) past the
// response — give it the full Hobby budget (default is 10s) so it isn't cut off mid-prepare.
export const maxDuration = 60;

/**
 * POST /api/v1/client/website/generate — enqueue a background generation.
 * Returns 202 immediately; the heavy work runs server-side and survives the
 * browser closing. The client polls GET for status.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
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
    // Test Mode generation is a fast stub/replay (no LLM), so it always runs inline — never offload
    // it to the paid edge function, even on Vercel.
    const testMode = await isTestMode(client.id);
    if (process.env.VERCEL && !testMode) {
      // Vercel: the long HTML call can't run in a 60s function. `after` keeps this function alive
      // past the 202 response to run prepare (config + image prep + prompt build), which then hands
      // the long call off to the Supabase edge function. See modules/website/generation-offload.ts.
      after(() =>
        prepareGeneration(jobId).catch((e) => console.error("[generate] prepare failed", jobId, e)),
      );
    } else if (testMode || process.env.GENERATION_WORKER !== "external") {
      // Local / single-node / Test Mode: process inline (atomic claim).
      void claimAndRun(jobId).catch((e) => console.error("[generate] inline job failed", jobId, e));
    }
    // else: an external `npm run worker` process drains the queue.
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
    ({ client } = await requireCapability("website", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const job = await getLatestJobStatus(client.id);
  return NextResponse.json({ job });
}
