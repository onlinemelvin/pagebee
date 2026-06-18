import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { finalizeGeneration } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Finalize does the Tailwind precompile + version writes — no LLM call, comfortably under 60s.
export const maxDuration = 60;

const schema = z.object({ jobId: z.string().min(1) });

/**
 * POST /api/v1/internal/generate/finalize — called by the Supabase Edge Function once it has
 * written the raw HTML completion to the job (`llmResult`). Assembles the WebsiteVersion from the
 * prepared phase-1 outputs. Guarded by the shared INTERNAL_API_SECRET (the edge sends it as
 * `x-internal-secret`). Fail-closed: refuses to run if the secret isn't configured.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (req.headers.get("x-internal-secret") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    await finalizeGeneration(parsed.data.jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[finalize] failed", parsed.data.jobId, err);
    return NextResponse.json({ error: "finalize_failed" }, { status: 500 });
  }
}
