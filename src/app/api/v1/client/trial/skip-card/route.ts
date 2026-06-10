import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { setClientFeature } from "@/lib/modules/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/trial/skip-card — dismiss the "add a card" trial prompt for now. */
export async function POST() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  await setClientFeature(client.id, "trial.cardSkipped", true);
  return NextResponse.json({ ok: true });
}
