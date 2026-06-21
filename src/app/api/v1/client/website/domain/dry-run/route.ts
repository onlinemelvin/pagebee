import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature, isDomainDryRunEligible } from "@/lib/auth/policy";
import { setClientFeature } from "@/lib/modules/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/**
 * POST /api/v1/client/website/domain/dry-run — toggle test-mode domain purchasing (simulate a buy:
 * no registrar call, no charge). GATED: only eligible testers (@test.com / the owner's account)
 * may set it — a real customer hitting this directly gets 403, so the capability can't leak from
 * the frontend. The flag lives server-side (a per-client FeatureFlag) and executePurchase reads it.
 */
export async function POST(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireOwner());
    assertFeature(client, "customDomain");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!isDomainDryRunEligible(ctx.email)) {
    return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  await setClientFeature(client.id, "domainBuyDryRun", parsed.data.enabled);
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
