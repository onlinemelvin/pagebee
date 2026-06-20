import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { requestPurchaseDomain } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // an affordable buy registers inline

const schema = z.object({ domain: z.string().min(1).max(253) });

const ERRORS: Record<string, { status: number; message: string }> = {
  no_site: { status: 409, message: "Create your website before adding a domain." },
  in_progress: { status: 409, message: "You already have a domain in progress. Remove it first." },
  taken: { status: 409, message: "That domain is already connected to another site." },
  unavailable: { status: 409, message: "That domain is no longer available." },
  price_unavailable: { status: 502, message: "Couldn't get a price for that domain. Try another." },
  registrar_unavailable: { status: 503, message: "Domain purchasing isn't available right now." },
  lookup_failed: { status: 502, message: "Couldn't check that domain. Try again." },
};

/** POST /api/v1/client/website/domain/purchase — buy a domain (auto under the cap, else admin review). */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
    assertFeature(client, "customDomain");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  const result = await requestPurchaseDomain(client.id, parsed.data.domain);
  if (!result.ok) {
    const e = ERRORS[result.reason] ?? { status: 400, message: "Could not start the purchase." };
    return NextResponse.json({ error: result.reason, message: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, domain: result.state });
}
