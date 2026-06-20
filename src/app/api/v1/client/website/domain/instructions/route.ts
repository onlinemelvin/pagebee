import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getDomainState, getConnectInstructions } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI fallback for unknown registrars

const schema = z.object({ registrar: z.string().min(1).max(40) });

/**
 * POST /api/v1/client/website/domain/instructions — step-by-step DNS instructions for the client's
 * chosen registrar, for the domain they're connecting. Records are read server-side from the
 * client's current (verifying) domain so the steps reference the right ones.
 */
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

  const state = await getDomainState(client.id);
  if (!state?.domain) return NextResponse.json({ error: "no_domain" }, { status: 409 });
  const records = state.hosts.flatMap((h) => h.verification?.records ?? []);

  const instructions = await getConnectInstructions(parsed.data.registrar, state.domain, records);
  return NextResponse.json({ instructions }, { headers: { "Cache-Control": "no-store" } });
}
