import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { isTestModeEligible } from "@/lib/auth/policy";
import { setClientFeature, TEST_MODE_KEY } from "@/lib/modules/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/**
 * POST /api/v1/client/test-mode — toggle global Test Mode. When ON, website
 * generation stubs the LLM (replaying this client's last saved version) and
 * domain purchases run as dry-runs. GATED: only eligible testers (@test.com /
 * the owner's account) may set it, so a real customer can't enable it.
 */
export async function POST(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!isTestModeEligible(ctx.email)) return NextResponse.json({ error: "not_eligible" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  await setClientFeature(client.id, TEST_MODE_KEY, parsed.data.enabled);
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
