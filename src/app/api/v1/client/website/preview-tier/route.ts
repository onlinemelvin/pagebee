import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { isTestMode } from "@/lib/modules/client";
import { prisma } from "@/lib/db";
import { startGeneration, claimAndRun, prepareGeneration, type GenerationForm } from "@/lib/modules/website";
import { planByName } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ plan: z.string().min(1).max(40) });

/**
 * POST /api/v1/client/website/preview-tier — regenerate the site at a DIFFERENT (usually higher) tier
 * for a FREE preview. Reuses the client's last intake + sets `previewPlan`, so the generated site (and
 * its preview serving) shows that tier's capabilities. No charge and no live change — payment only
 * happens later at Approve & launch, which bills for whatever tier the preview was generated at.
 * Owner-only. Does NOT consume the monthly-update quota (it's a sales preview, not a live update).
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !planByName(parsed.data.plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  // Reuse the most recent intake so the only thing that changes is the tier.
  const lastJob = await prisma.websiteGenerationJob.findFirst({
    where: { website: { clientId: client.id } },
    orderBy: { createdAt: "desc" },
    select: { inputIntake: true },
  });
  if (!lastJob?.inputIntake) return NextResponse.json({ error: "no_prior_generation" }, { status: 409 });

  const form = { ...(lastJob.inputIntake as object), previewPlan: parsed.data.plan } as unknown as GenerationForm;

  try {
    const { jobId } = await startGeneration(client.id, form);
    const testMode = await isTestMode(client.id);
    if (process.env.VERCEL && !testMode) {
      after(() => prepareGeneration(jobId).catch((e) => console.error("[preview-tier] prepare failed", jobId, e)));
    } else if (testMode || process.env.GENERATION_WORKER !== "external") {
      void claimAndRun(jobId).catch((e) => console.error("[preview-tier] inline job failed", jobId, e));
    }
    return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
  } catch (err) {
    console.error("[POST /api/v1/client/website/preview-tier]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
