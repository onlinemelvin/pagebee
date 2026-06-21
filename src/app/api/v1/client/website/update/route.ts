import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { requestWebsiteUpdate } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/website/update — request a minor update to the client's LIVE site.
 * Quota-gated; returns { ok:false, reason:"out_of_updates", quota } so the UI can upsell.
 * Body: { note }.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note : undefined;

  try {
    const result = await requestWebsiteUpdate(client.id, note);
    if (!result.ok) {
      const status = result.reason === "out_of_updates" ? 409 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/v1/client/website/update]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
