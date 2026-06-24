import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { approve, PreviewError } from "@/lib/modules/preview";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/preview/approve — approve the preview (test launches; real → setup fee). */
export async function POST() {
  let client, ctx;
  try {
    ({ client, ctx } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    const result = await approve(client.id);
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: ctx.userId,
      event: "preview_approved",
      properties: { clientId: client.id },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PreviewError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/preview/approve]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
