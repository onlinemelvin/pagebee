import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getSavedCard, createCardSetupIntent, setDefaultCardFromSetupIntent, BillingError } from "@/lib/modules/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the saved default card (brand + last4 + expiry), or { card: null }. Owner-only. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const card = await getSavedCard(client.id).catch(() => null);
  return NextResponse.json({ card });
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup-intent") }),
  z.object({ action: z.literal("set-default"), setupIntentId: z.string().min(1).max(200) }),
]);

/**
 * POST — change the card on file. `setup-intent` returns a client secret for the embedded element;
 * after it confirms, `set-default` (with the SetupIntent id) makes that card the billing default.
 */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    if (parsed.data.action === "setup-intent") {
      return NextResponse.json(await createCardSetupIntent(client.id));
    }
    return NextResponse.json(await setDefaultCardFromSetupIntent(client.id, parsed.data.setupIntentId));
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[billing/payment-method]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
