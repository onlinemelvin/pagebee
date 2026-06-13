import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getClientWorkspace, setClientFeature } from "@/lib/modules/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ key: z.string().min(1).max(40), enabled: z.boolean() });

/** POST /api/v1/client/features — enable/disable a feature (plan-gated via the feature cards). */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ws = await getClientWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The key must map to a real feature card; you can't enable something locked to a higher tier.
  const feature = ws.features.find((f) => f.toggleKey === parsed.data.key);
  if (!feature) return NextResponse.json({ error: "unknown_feature" }, { status: 400 });
  if (parsed.data.enabled && feature.state === "locked") {
    return NextResponse.json({ error: "feature_not_in_plan" }, { status: 403 });
  }

  await setClientFeature(client.id, parsed.data.key, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}
