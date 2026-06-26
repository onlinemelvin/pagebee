import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getSiteBlocks, setTierView } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// (tier switching is no-regen; the old regen-based preview-tier route was removed)

/** GET — the site's content blocks + current view tier + kept-block choice (for the tier switcher). */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await getSiteBlocks(client.id));
}

const schema = z.object({ plan: z.string().min(1).max(40), keptSections: z.array(z.string().max(60)).max(50).optional() });

/**
 * POST — switch the view tier with NO regeneration. Records the selected plan + (on a downgrade) the
 * owner's kept-block choice; the serve pipeline hides the rest. Payment still happens only at launch.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    return NextResponse.json(await setTierView(client.id, parsed.data.plan, parsed.data.keptSections));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: msg }, { status: msg === "invalid_plan" ? 400 : 500 });
  }
}
