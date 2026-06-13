import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { submitOnboarding, getOnboardingState, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — current onboarding/requirements state. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ state: await getOnboardingState(client.id) });
}

/** POST — submit the white-label onboarding (creates/updates the Custom account). */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  try {
    const state = await submitOnboarding(client.id, body, ip);
    return NextResponse.json({ state });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    // Surface Stripe's own message so the owner can fix bad input (e.g. invalid routing number).
    const msg = err instanceof Error ? err.message : "internal_error";
    console.error("[POST /payments/onboarding]", err);
    return NextResponse.json({ error: "stripe_error", message: msg }, { status: 400 });
  }
}
