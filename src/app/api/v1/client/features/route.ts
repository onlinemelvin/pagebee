import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getClientWorkspace, setClientFeature } from "@/lib/modules/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ key: z.string().min(1).max(40), enabled: z.boolean() });

/**
 * GET /api/v1/client/features — the client's live feature states (the same cards the dashboard
 * renders). Read by the Media gallery switch and the Website feature cards on mount to reconcile
 * against the authoritative DB value: a plain `fetch` (cache: no-store) bypasses the RSC Router
 * Cache, which can otherwise serve a stale prefetched copy of a sibling page after a toggle.
 */
export async function GET() {
  try {
    await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const ws = await getClientWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(
    { features: ws.features },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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
  // e.g. the gallery can't be added once every page/section slot in the plan is already used.
  if (parsed.data.enabled && feature.blockedReason) {
    return NextResponse.json({ error: "no_page_room", message: feature.blockedReason }, { status: 409 });
  }

  await setClientFeature(client.id, parsed.data.key, parsed.data.enabled);
  // A feature flag is read by every page under the client layout (the Media gallery switch and the
  // Website "Add features" cards both write here), so purge the whole subtree's Router Cache —
  // otherwise a toggle on one page shows stale on the other until a hard reload.
  revalidatePath("/client", "layout");
  return NextResponse.json({ ok: true });
}
