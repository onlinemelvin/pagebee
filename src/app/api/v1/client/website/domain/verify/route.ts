import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { verifyClientDomains } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/website/domain/verify — run a live Vercel verification for THIS client's
 * pending hosts and return the refreshed state. This is the primary "is my DNS live yet?" path
 * (the owner's "Check status" button + the panel's auto-poll), so a connection goes active in
 * seconds without depending on the daily cron backstop.
 */
export async function POST() {
  let client;
  try {
    ({ client } = await requireOwner());
    assertFeature(client, "customDomain");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const state = await verifyClientDomains(client.id);
  return NextResponse.json({ domain: state }, { headers: { "Cache-Control": "no-store" } });
}
