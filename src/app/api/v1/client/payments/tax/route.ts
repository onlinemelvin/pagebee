import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getTaxStatus, syncTaxRegistrations, PaymentError } from "@/lib/modules/payments";
import { saveFinanceSettings, getFinanceSettings } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — current Stripe Tax status (active, registered states, mode). */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ status: await getTaxStatus(client.id) });
}

/**
 * PUT — set the tax mode and (for automatic) the states the client collects in.
 * Body: { mode: "manual" | "automatic", states?: string[] }
 */
export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await req.json().catch(() => null)) as { mode?: string; states?: string[] } | null;
  try {
    if (body?.mode === "automatic") {
      const status = await syncTaxRegistrations(client.id, Array.isArray(body.states) ? body.states : []);
      return NextResponse.json({ status });
    }
    // Switch back to manual.
    const settings = await getFinanceSettings(client.id);
    await saveFinanceSettings(client.id, { ...settings, taxMode: "manual" });
    return NextResponse.json({ status: await getTaxStatus(client.id) });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    const msg = err instanceof Error ? err.message : "internal_error";
    console.error("[PUT /payments/tax]", err);
    return NextResponse.json({ error: "stripe_error", message: msg }, { status: 400 });
  }
}
