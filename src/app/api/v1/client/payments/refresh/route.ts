import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { refreshAccountStatus, getPaymentStatus } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/payments/refresh — re-pull Connect account status from Stripe. */
export async function POST() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  await refreshAccountStatus(client.id).catch(() => {});
  return NextResponse.json({ status: await getPaymentStatus(client.id) });
}
